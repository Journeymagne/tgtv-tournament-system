const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { poolOptions, resetSchemas } = require('../helpers/schema');
const { migrate } = require('../../src/db/migrate');
const users = require('../../src/db/repositories/users');
const calendar = require('../../src/api/calendar-events');
const tournaments = require('../../src/api/tournaments');
const routes = require('../../src/api/routes-tournaments');
let pool, admin, player;
const data = { name: 'Calendar cup', date: '2026-11-21', time: '10:00', city: 'Moscow', venue: 'Club', address: '', tournamentType: 'solo', participantLimit: 32, entryFee: 1500 };
async function tx(action) { const c = await pool.connect(); try { await c.query('BEGIN'); const result = await action(c); await c.query('COMMIT'); return result; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
test.before(async () => { pool = new Pool(poolOptions); await resetSchemas(pool); await migrate(pool); });
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  await pool.query('TRUNCATE accounts.users,tournaments.tournaments RESTART IDENTITY CASCADE');
  admin = await users.insert(pool, { name: 'CalendarAdmin', passwordHash: 's:h', rating: 1000, isAdmin: true });
  player = await users.insert(pool, { name: 'CalendarPlayer', passwordHash: 's:h', rating: 1000 });
});
test('calendar routes are public to read and require authenticated scoped writes', async () => {
  assert.equal(routes.find(r => r.path === '/api/calendar-events').auth, 'none');
  for (const r of routes.filter(r => r.path.startsWith('/api/admin/calendar-events'))) assert.equal(r.auth, 'user');
  await assert.rejects(tx(client => calendar.create({ client, user: player, body: data })), { status: 403 });
  const saved = await tx(client => calendar.create({ client, user: admin, body: data }));
  const event = saved.body.event;
  const list = await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') });
  assert.equal(list.events.length, 1);
  assert.equal(list.events[0].date, data.date);
  const changed = await tx(client => calendar.update({ client, user: admin, params: { id: event.id }, body: { ...data, name: 'New name', expectedUpdatedAt: event.updatedAt } }));
  assert.equal(changed.event.name, 'New name');
  await assert.rejects(tx(client => calendar.update({ client, user: admin, params: { id: event.id }, body: { ...data, expectedUpdatedAt: event.updatedAt } })), { status: 409 });
  await tx(client => calendar.remove({ client, user: admin, params: { id: event.id } }));
  assert.equal((await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') })).events.length, 0);
});
test('creating from a calendar event is atomic, prevents duplicates and hides drafts from guests', async () => {
  const event = (await tx(client => calendar.create({ client, user: admin, body: data }))).body.event;
  const body = { name: data.name, gameSystem: 'Warhammer 40k Kill Team', venueMode: 'irl', format: 'swiss', swissRoundCount: 3, calendarEventId: event.id };
  const outcomes = await Promise.allSettled([1, 2].map(() => tx(client => tournaments.createAdmin({ client, user: admin, body }))));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(r => r.status === 'rejected').reason.status, 409);
  const publicEvent = (await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') })).events[0];
  assert.equal(publicEvent.tournamentCreated, true);
  assert.equal(publicEvent.tournament, null);
  await pool.query("UPDATE tournaments SET logo_data='data:image/png;base64,aGVsbG8=' WHERE id=(SELECT tournament_id FROM calendar_events WHERE id=$1)",[event.id]);
  const hiddenPoster=(await calendar.list({client:pool,user:null,query:new URLSearchParams('month=2026-11')})).events[0];
  assert.equal(hiddenPoster.posterUrl,null);
  const adminEvent = (await calendar.getAdmin({ client: pool, user: admin, params: { id: event.id } })).event;
  assert.ok(adminEvent.tournament.id);
  assert.equal(adminEvent.posterUrl,`/api/tournament-logos/${adminEvent.tournament.id}`);
  await pool.query("UPDATE tournaments SET status='registration_open' WHERE id=$1", [adminEvent.tournament.id]);
  const published = (await calendar.list({ client: pool, user: null, query: new URLSearchParams('month=2026-11') })).events[0];
  assert.ok(published.tournament.slug);
  assert.equal(published.posterUrl,adminEvent.posterUrl);
  await pool.query('DELETE FROM tournaments WHERE id=$1', [adminEvent.tournament.id]);
  assert.equal((await calendar.getAdmin({ client: pool, user: admin, params: { id: event.id } })).event.tournamentCreated, false);
});
test('calendar persists participant settings and transfers rounds and roster size to tournament defaults', async()=>{
  const saved=await tx(client=>calendar.create({client,user:admin,body:{...data,participantMode:'team',teamSize:2,swissRoundCount:5,participantLimit:24}}));
  const event=saved.body.event;
  assert.equal(event.participantMode,'team');assert.equal(event.teamSize,2);assert.equal(event.swissRoundCount,5);
  assert.equal(event.tournamentType,'pairs');
  const detail=await calendar.getAdmin({client:pool,user:admin,params:{id:event.id}});
  assert.equal(detail.tournamentDefaults.swissRoundCount,5);assert.equal(detail.tournamentDefaults.registrationLimit,12);
  const updated=await tx(client=>calendar.update({client,user:admin,params:{id:event.id},body:{participantMode:'individual',swissRoundCount:4,expectedUpdatedAt:event.updatedAt}}));
  assert.equal(updated.event.participantMode,'individual');assert.equal(updated.event.teamSize,null);assert.equal(updated.event.swissRoundCount,4);
  const defaults=(await calendar.getAdmin({client:pool,user:admin,params:{id:event.id}})).tournamentDefaults;
  assert.equal(defaults.participantMode,'individual');assert.equal(Object.hasOwn(defaults,'teamSize'),false);
  const legacy=await tx(client=>calendar.update({client,user:admin,params:{id:event.id},body:{tournamentType:'teams',expectedUpdatedAt:updated.event.updatedAt}}));
  assert.equal(legacy.event.teamSize,3);assert.equal(legacy.event.participantMode,'team');assert.equal(legacy.event.swissRoundCount,4);
});

test('bad tournament creation rolls back the link; removing the event retains the tournament', async () => {
  const event = (await tx(client => calendar.create({ client, user: admin, body: data }))).body.event;
  await assert.rejects(tx(client => tournaments.createAdmin({ client, user: admin, body: { name: data.name, format: 'invalid', calendarEventId: event.id } })));
  assert.equal((await calendar.getAdmin({ client: pool, user: admin, params: { id: event.id } })).event.tournamentCreated, false);
  const created = await tx(client => tournaments.createAdmin({ client, user: admin, body: { name: data.name, gameSystem: 'Warhammer 40k Kill Team', calendarEventId: event.id } }));
  await tx(client => calendar.remove({ client, user: admin, params: { id: event.id } }));
  assert.equal(Number((await pool.query('SELECT count(*) FROM tournaments WHERE id=$1', [created.body.tournament.id])).rows[0].count), 1);
});

test('calendar participation is personal and excludes removed registrations and hidden tournaments', async () => {
  const event = (await tx(client => calendar.create({client,user:admin,body:data}))).body.event;
  const created = await tx(client => tournaments.createAdmin({client,user:admin,body:{name:data.name,gameSystem:'Warhammer 40k Kill Team',calendarEventId:event.id}}));
  const id = created.body.tournament.id;
  const listing = async user => (await calendar.list({client:pool,user,query:new URLSearchParams('month=2026-11')})).events[0];
  assert.equal((await listing(player)).isParticipant,false);
  const participant = await require('../../src/db/repositories/tournament-participants').insert(pool,{
    tournamentId:id,userId:player.id,displayName:player.name,displayNameKey:player.name.toLowerCase(),status:'joined',source:'self_join'
  });
  assert.equal((await listing(player)).isParticipant,false); // Draft stays hidden.
  await pool.query("UPDATE tournaments SET status='registration_open' WHERE id=$1",[id]);
  assert.equal((await listing(player)).isParticipant,true);
  assert.equal((await listing(null)).isParticipant,false);
  assert.equal((await listing(admin)).isParticipant,false); // Ownership is not participation.
  for(const status of ['withdrawn','removed']) {
    await pool.query('UPDATE tournament_participants SET status=$2 WHERE id=$1',[participant.id,status]);
    assert.equal((await listing(player)).isParticipant,false);
  }
});

test('calendar recognises a team roster member or captain, excluding replaced members and withdrawn rosters', async () => {
  const event = (await tx(client => calendar.create({client,user:admin,body:{...data,participantMode:'team',teamSize:3}}))).body.event;
  const created = await tx(client => tournaments.createAdmin({client,user:admin,body:{name:data.name,gameSystem:'Warhammer 40k Kill Team',participantMode:'team',teamSize:3,format:'swiss',pairingType:'shield_sword',calendarEventId:event.id}}));
  const id = created.body.tournament.id;
  await pool.query("UPDATE tournaments SET status='registration_open' WHERE id=$1",[id]);
  const team = await require('../../src/db/repositories/player-teams').insert(pool,{slug:'calendar-team',name:'Calendar team',nameKey:'calendar team',leaderUserId:admin.id});
  const roster = await require('../../src/db/repositories/team-rosters').insert(pool,{
    tournamentId:id,teamId:team.id,name:team.name,nameKey:team.nameKey,captainUserId:admin.id,registeredByUserId:admin.id,teamNameSnapshot:team.name
  },[{userId:player.id,slot:1,displayNameSnapshot:player.name,factionSnapshot:'Kommandos'}]);
  const participating = async user => (await calendar.list({client:pool,user,query:new URLSearchParams('month=2026-11')})).events[0].isParticipant;
  assert.equal(await participating(player),true);
  assert.equal(await participating(admin),true);
  assert.equal(await participating(null),false);
  await pool.query('UPDATE tournament_team_roster_members SET ended_at=NOW() WHERE roster_id=$1',[roster.id]);
  assert.equal(await participating(player),false);
  await pool.query("UPDATE tournament_team_rosters SET status='withdrawn' WHERE id=$1",[roster.id]);
  assert.equal(await participating(admin),false);
});

test('dated tournaments appear automatically, hide drafts, and move the same event across months in the supplied time zone', async () => {
  const created = await tx(client => tournaments.createAdmin({client,user:admin,body:{name:'Automatic cup',startsAt:'2026-11-30T21:30:00Z',calendarTimeZone:'Europe/Moscow',format:'swiss',swissRoundCount:4}}));
  const id=created.body.tournament.id;
  const list=async(month,user=admin)=>(await calendar.list({client:pool,user,query:new URLSearchParams({month})})).events;
  assert.equal((await list('2026-11')).length,0);
  const [event]=await list('2026-12');
  assert.equal(event.date,'2026-12-01');assert.equal(event.time,'00:30');
  assert.equal(event.entryFee,null);assert.equal(event.participantLimit,null);
  assert.equal(event.city,'');assert.equal(event.venue,'');assert.equal(event.swissRoundCount,4);
  const edited=await tx(client=>calendar.update({client,user:admin,params:{id:event.id},body:{name:'Custom announcement',participantLimit:'',entryFee:'',expectedUpdatedAt:event.updatedAt}}));
  assert.equal(edited.event.entryFee,null);assert.equal(edited.event.participantLimit,null);
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{description:'Description only',startsAt:'2026-11-30T21:30:00Z',calendarTimeZone:'Europe/London'}}));
  assert.equal((await list('2026-12'))[0].time,'00:30');
  assert.equal((await list('2026-12',null)).length,0);
  await tx(client=>tournaments.publishAdmin({client,user:admin,params:{id},body:{}}));
  assert.equal((await list('2026-12',null))[0].id,event.id);
  const patch={startsAt:'2026-12-31T21:15:00Z'};
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:patch}));
  const [moved]=await list('2027-01');
  assert.equal(moved.id,event.id);assert.equal(moved.date,'2027-01-01');assert.equal(moved.time,'00:15');
  assert.equal((await list('2026-12')).length,0);
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:patch}));
  assert.equal((await list('2027-01')).length,1);
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{
    startsAt:'2027-01-02T02:15:00Z',calendarTimeZone:'America/Los_Angeles'
  }}));
  const [relocated]=await list('2027-01');
  assert.equal(relocated.id,event.id);
  assert.equal(relocated.date,'2027-01-01');
  assert.equal(relocated.time,'18:15');
  assert.equal(relocated.timeZone,'America/Los_Angeles');
  assert.equal(Number((await pool.query('SELECT count(*) FROM calendar_events WHERE tournament_id=$1',[id])).rows[0].count),1);
});

test('sync reuses a linked announcement and preserves its custom details while moving the date', async () => {
  const event=(await tx(client=>calendar.create({client,user:admin,body:data}))).body.event;
  const created=await tx(client=>tournaments.createAdmin({client,user:admin,body:{name:'Different tournament title',calendarEventId:event.id,startsAt:'2026-11-22T07:00:00Z',calendarTimeZone:'Europe/Moscow'}}));
  const id=created.body.tournament.id;
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{startsAt:'2026-12-01T08:00:00Z'}}));
  const moved=(await calendar.getAdmin({client:pool,user:admin,params:{id:event.id}})).event;
  assert.equal(moved.id,event.id);assert.equal(moved.date,'2026-12-01');assert.equal(moved.time,'11:00');
  for(const field of ['name','city','venue','address','entryFee','participantLimit'])assert.equal(moved[field],event[field]);
  assert.equal(Number((await pool.query('SELECT count(*) FROM calendar_events WHERE tournament_id=$1',[id])).rows[0].count),1);
});

test('undated tournaments appear after scheduling and retain their linked event when unscheduled and scheduled again', async () => {
  const created=await tx(client=>tournaments.createAdmin({client,user:admin,body:{name:'Later',participantMode:'team',teamSize:2,pairingType:'doubles',venueMode:'irl',format:'swiss',registrationLimit:12}}));
  const id=created.body.tournament.id;
  const linked=()=>pool.query('SELECT * FROM calendar_events WHERE tournament_id=$1',[id]);
  assert.equal((await linked()).rows.length,0);
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{startsAt:'2026-11-25T09:00:00Z'}}));
  const [first]=(await linked()).rows;
  assert.equal(first.tournament_type,'pairs');assert.equal(first.team_size,2);assert.equal(Number(first.participant_limit),24);
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{startsAt:null}}));
  assert.equal((await linked()).rows[0].event_date,null);
  assert.equal((await calendar.list({client:pool,user:admin,query:new URLSearchParams('month=2026-11')})).events.length,0);
  await tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{startsAt:'2026-11-26T09:00:00Z'}}));
  assert.equal((await linked()).rows[0].id,first.id);
  await assert.rejects(tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{startsAt:'2026-11-27T09:00:00Z',calendarTimeZone:'invalid/zone'}})),{status:400});
  await assert.rejects(tx(client=>tournaments.updateAdmin({client,user:admin,params:{id},body:{startsAt:'2100-01-01T09:00:00Z'}})),{status:400});
});
