const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { poolOptions, resetSchemas } = require('../helpers/schema');
const { migrate } = require('../../src/db/migrate');
const users = require('../../src/db/repositories/users');
const access = require('../../src/db/repositories/access');
const rights = require('../../src/domain/access');
const tournaments = require('../../src/api/tournaments');
const calendar = require('../../src/api/calendar-events');
const staff = require('../../src/api/access-management');
let pool, owner, author, judge, admin, providerId;

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
const create = (user, body) => transaction(client => tournaments.createAdmin({client, user, body: {name:'Cup', ...body}}));
test.before(async () => {
  pool = new Pool(poolOptions);
  await resetSchemas(pool);
  await migrate(pool);
});
test.after(() => pool.end());
test.beforeEach(async () => {
  await pool.query('TRUNCATE accounts.users,tournaments.tournaments RESTART IDENTITY CASCADE');
  const make = (name,isAdmin=false) => users.insert(pool,{name,isAdmin,passwordHash:'s:h',rating:1000});
  owner = await make('ProviderOwner');
  author = await make('ProviderAuthor');
  judge = await make('ProviderJudge');
  admin = await make('ProviderAdmin', true);
  await transaction(async client => {
    const {rows:[p]} = await client.query(`INSERT INTO tournament_providers
      (name,name_key,slug,city,logo_data,owner_user_id,created_by_user_id)
      VALUES ('Club','club','club','City','data:image/png;base64,YQ==',$1,$1) RETURNING id`, [owner.id]);
    providerId = p.id;
    await client.query(`INSERT INTO tournament_provider_memberships (provider_id,user_id,role)
      VALUES ($1,$2,'organizer'),($1,$3,'organizer'),($1,$4,'judge')`, [p.id,owner.id,author.id,judge.id]);
  });
});

test('scoped organizer creates only for their organization, judge inherits match access and cannot finish', async () => {
  const {body:{tournament:t}} = await create(author,{providerId});
  assert.equal(t.providerId,providerId);
  assert.equal(t.provider.name,'Club');
  await assert.rejects(create(author,{}),{status:403});
  await assert.rejects(create(judge,{providerId}),{status:403});
  const outsider = await users.insert(pool,{name:'Visitor',passwordHash:'s:h',rating:1000});
  await assert.rejects(create(outsider,{providerId}),{status:403});
  const active = await access.hydrate(pool,author);
  assert.equal(active.capabilities.canCreateTournaments,false);
  assert.equal(active.capabilities.canCreateProviderEvents,true);
  for (const target of [t, t.id]) {
    assert.equal(rights.canFinishTournament(active,target),true);
    assert.equal(rights.canManageJudges(active,target),false);
    const j = await access.hydrate(pool,judge);
    assert.equal(rights.canManageTournament(j,target),true);
    assert.equal(rights.canFinishTournament(j,target),false);
  }
  await pool.query("UPDATE tournament_provider_memberships SET role='judge' WHERE provider_id=$1 AND user_id=$2",[providerId,author.id]);
  await assert.rejects(transaction(client => tournaments.publishFinalStandingsAdmin({client,user:active,params:{id:t.id},body:{}})),{status:403});
  await assert.rejects(transaction(client => tournaments.updateAdmin({client,user:admin,params:{id:t.id},body:{provider_id:null}})),{status:403});
});

test('removal wins against a waiting write and explicit judge access survives membership removal', async () => {
  const {body:{tournament:t}} = await create(author,{providerId});
  const stale = await access.hydrate(pool,author);
  await transaction(client => staff.assignJudge({client,user:admin,params:{id:t.id},body:{userId:judge.id}}));
  const before = (await staff.staff({client:pool,user:admin,params:{id:t.id}})).staff;
  const judgeEntry = before.find(entry=>entry.userId===judge.id);
  assert.equal(judgeEntry.providerRole,'judge');
  assert.equal(judgeEntry.assigned,true);
  assert.equal(judgeEntry.hasPlatformAccess,false);
  assert.equal(before.find(entry=>entry.userId===admin.id).hasPlatformAccess,true);
  let waiting;
  await transaction(async client => {
    await client.query('SELECT id FROM tournament_providers WHERE id=$1 FOR UPDATE',[providerId]);
    const {rows:[blocker]} = await client.query('SELECT pg_backend_pid() AS pid');
    let writerPid;
    waiting = transaction(async worker => {
      writerPid = (await worker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      return tournaments.updateAdmin({client:worker,user:stale,params:{id:t.id},body:{description:'Updated'}});
    }).then(()=>null,error=>error);
    const deadline = Date.now()+5000;
    let blocked = false;
    while (!blocked && Date.now()<deadline) {
      if (writerPid) blocked = (await client.query('SELECT $1=ANY(pg_blocking_pids($2)) AS blocked',[blocker.pid,writerPid])).rows[0].blocked;
      if (!blocked) await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.equal(blocked,true,'the write reached the provider lock before revocation');
    await client.query('UPDATE tournament_provider_memberships SET ended_at=NOW() WHERE provider_id=$1 AND user_id=ANY($2::int[])',[providerId,[author.id,judge.id]]);
  });
  assert.equal((await waiting)?.status,403);
  const removed = await access.hydrate(pool,author);
  assert.equal(rights.canManageTournament(removed,t),false);
  assert.equal(rights.canManageTournament(removed,t.id),false);
  assert.equal(rights.canManageTournament(await access.hydrate(pool,judge),t.id),true);
  const after = (await staff.staff({client:pool,user:admin,params:{id:t.id}})).staff.find(entry=>entry.userId===judge.id);
  assert.equal(after.providerRole,null);
  assert.equal(after.assigned,true);
  assert.equal((await tournaments.listAdmin({client:pool,user:removed})).tournaments.length,0);
  await assert.rejects(tournaments.getPublic({client:pool,user:removed,params:{slug:t.slug}}),{status:404});
  await pool.query("UPDATE tournaments SET logo_data='data:image/png;base64,YQ==' WHERE id=$1",[t.id]);
  const logo = user => require('../../src/api/tournament-live').logo({client:pool,user,params:{kind:'tournament',id:t.id}});
  for (const visitor of [null,removed]) await assert.rejects(logo(visitor),{status:404});
  assert.ok((await logo(await access.hydrate(pool,judge))).buffer.length);
  const {rows:[stored]} = await pool.query('SELECT description FROM tournaments WHERE id=$1',[t.id]);
  assert.equal(stored.description,'');
});

test('provider calendar inherits organization on conversion and hides a draft link from guests', async () => {
  const body = {providerId,name:'Announcement',date:'2099-11-21',time:'00:30',calendarTimeZone:'Asia/Tokyo',city:'City',venue:'Club',address:'',tournamentType:'solo',participantLimit:8,entryFee:0};
  const {body:{event}} = await transaction(client => calendar.create({client,user:author,body}));
  assert.equal(event.providerId,providerId);
  await assert.rejects(create(admin,{calendarEventId:event.id,providerId:null}),{status:403});
  await assert.rejects(create(judge,{calendarEventId:event.id}),{status:403});
  const {tournamentDefaults} = await calendar.getAdmin({client:pool,user:owner,params:{id:event.id}});
  assert.equal(tournamentDefaults.startsAt,'2099-11-20T15:30:00.000Z');
  const {body:{tournament}} = await create(owner,{...tournamentDefaults,calendarEventId:event.id,calendarTimeZone:'America/Los_Angeles'});
  assert.equal(tournament.startsAt,tournamentDefaults.startsAt);
  assert.equal(tournament.provider.id,providerId);
  const list = user => calendar.list({client:pool,user,query:new URLSearchParams('month=2099-11')});
  const guest = (await list(null)).events[0];
  assert.equal(guest.tournament,null);
  assert.equal(guest.posterUrl,null);
  const member = (await list(await access.hydrate(pool,judge))).events[0];
  assert.equal(member.tournament.id,tournament.id);
  assert.equal(member.date,'2099-11-21');
  assert.equal(member.time,'00:30');
  assert.equal(member.timeZone,'Asia/Tokyo');
  assert.equal(member.viewer.canEdit,false);
  assert.equal((await list(await access.hydrate(pool,author))).events[0].viewer.canEdit,true);
  await transaction(client=>tournaments.updateAdmin({client,user:author,params:{id:tournament.id},body:{
    startsAt:'2099-11-21T16:00:00Z',calendarTimeZone:'America/Los_Angeles'
  }}));
  const [rescheduled] = (await list(null)).events;
  assert.equal(rescheduled.id,event.id);
  assert.equal(rescheduled.date,'2099-11-22');
  assert.equal(rescheduled.time,'01:00');
  assert.equal(rescheduled.timeZone,'Asia/Tokyo');
});

test('archive blocks new provider events while existing tournament staff retain their roles', async () => {
  const {body:{tournament}} = await create(author,{providerId});
  await pool.query('UPDATE tournament_providers SET archived_at=NOW() WHERE id=$1',[providerId]);
  for (const user of [author,owner,admin]) await assert.rejects(create(user,{providerId}),{status:403});
  const after = await access.hydrate(pool,author);
  assert.equal(after.capabilities.canCreateProviderEvents,false);
  assert.equal(rights.canFinishTournament(after,tournament),true);
  const changed = await transaction(client=>tournaments.updateAdmin({client,user:after,params:{id:tournament.id},body:{description:'Continuing'}}));
  assert.equal(changed.tournament.description,'Continuing');
});

test('personal ownership and provider staff privileges are independent', async () => {
  await pool.query('UPDATE users SET can_create_tournaments=true WHERE id=$1',[author.id]);
  const {body:{tournament:personal}} = await create(author,{});
  const {body:{tournament:provided}} = await create(author,{providerId});
  await pool.query('INSERT INTO platform_ownership(owner_user_id) VALUES ($1)',[admin.id]);
  const superAdmin = await access.hydrate(pool,admin);
  assert.equal(rights.canManageJudges(superAdmin,provided.id),true);
  assert.equal(rights.canManageJudges(await access.hydrate(pool,owner),provided.id),true);
  assert.equal(rights.canManageJudges(await access.hydrate(pool,author),personal.id),true);
  assert.equal(personal.provider,null);
});
