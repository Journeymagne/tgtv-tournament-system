const test = require('node:test');
const assert = require('node:assert/strict');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool, withClient, withTransaction } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { createRouter } = require('../../src/http/router');
const { createRateLimiter } = require('../../src/http/rate-limit');
const { loadUserFromRequest } = require('../../src/api/auth');
const access = require('../../src/db/repositories/access');
const routes = require('../../src/api/routes');
const { startApiServer, createClient } = require('../helpers/client');
const limiter = createRateLimiter({max:1000,windowMs:60000});
let server, owner, organizer, judge, admin, player, cup, other;
const base = event => `/api/admin/tournaments/${event.id}`;
async function expect(request,status=200) {const result=await request; assert.equal(result.status,status,JSON.stringify(result.body));return result.body;}
async function register(name) {
  const http=createClient(server.baseUrl);
  const {user}=await expect(http.post('/api/register',{name,password:'password123',confirmPassword:'password123',telegramContact:`@${name}`}),201);
  assert.equal(user.isAdmin,false,'Registration must never grant global rights');
  return {...user,http};
}
async function event(actor,name) {return (await expect(actor.http.post('/api/admin/tournaments',{name,format:'swiss',swissRoundCount:3,startsAt:'2026-10-10T12:00:00Z'}),201)).tournament;}
test.before(async()=>{assert.match(new URL(TEST_DATABASE_URL).pathname,/test/);await migrate(getPool());server=await startApiServer(createRouter(routes,{withClient,withTransaction,loadUser:loadUserFromRequest,authLimiter:limiter}));});
test.after(async()=>{await server?.close();await closePool();});
test.beforeEach(async()=>{
  await getPool().query('TRUNCATE users, tournaments, games, player_teams RESTART IDENTITY CASCADE');limiter.reset();
  owner=await register('Owner');organizer=await register('Organizer');judge=await register('Judge');admin=await register('Administrator');player=await register('Player');
  await withTransaction(client=>access.initializeOwner(client,owner.id));
  await expect(owner.http.patch(`/api/admin/users/${organizer.id}/permissions`,{canCreateTournaments:true}));
  await expect(owner.http.patch(`/api/admin/users/${admin.id}/permissions`,{isAdmin:true}));
  cup=await event(organizer,'Organizer Cup');other=await event(owner,'Other Cup');
});
test('organizer owns one event; assigned judge operates it but cannot appoint judges, transfer ownership or cross event boundaries',async()=>{
  await expect(player.http.post('/api/admin/tournaments',{}),403);
  assert.deepEqual((await expect(organizer.http.get('/api/admin/tournaments'))).tournaments.map(item=>item.id),[cup.id]);
  await expect(organizer.http.get(base(other)),403);
  await expect(judge.http.get(base(cup)),403);
  await expect(organizer.http.post(`${base(cup)}/judges`,{userId:judge.id}));
  const me=await expect(judge.http.get('/api/me'));assert.equal(me.user.isAdmin,false);assert.equal(me.user.capabilities.canOpenAdministration,true);
  await expect(judge.http.get(base(cup)));
  await expect(judge.http.patch(base(cup),{description:'Judge can edit'}));
  await expect(judge.http.post(`${base(cup)}/judges`,{userId:player.id}),403);
  await expect(judge.http.del(`${base(cup)}/judges/${judge.id}`),403);
  await expect(judge.http.patch(`${base(cup)}/owner`,{userId:judge.id,reason:'Escalation'}),403);
  await expect(judge.http.patch(base(cup),{ownerUserId:judge.id}),403);
  await expect(judge.http.get(base(other)),403);
  await expect(judge.http.get('/api/admin/users'),403);
  await expect(judge.http.get('/api/admin/documentation'),404);
  await expect(organizer.http.del(`${base(cup)}/judges/${judge.id}`));
  await expect(judge.http.patch(base(cup),{description:'Revoked'}),403);
});
test('platform administrator is automatically judge of every event but cannot manage another organizer’s judges',async()=>{
  for(const tournament of [cup,other]) {
    await expect(admin.http.get(base(tournament)));
    await expect(admin.http.patch(base(tournament),{description:'Automatic judge'}));
    const roster=await expect(admin.http.get(`${base(tournament)}/staff`));
    assert.equal(roster.canManageJudges,false);
    assert.equal(roster.staff.find(person=>person.userId===admin.id).automatic,true);
    await expect(admin.http.post(`${base(tournament)}/judges`,{userId:player.id}),403);
  }
  const owned=await event(admin,'Admin Own Cup');
  await expect(admin.http.post(`${base(owned)}/judges`,{userId:judge.id}));
  await expect(organizer.http.del(`${base(cup)}/judges/${admin.id}`),409);
  await expect(owner.http.patch(`/api/admin/users/${admin.id}/permissions`,{isAdmin:false}));
  await expect(admin.http.get(base(cup)),403);
  await expect(admin.http.get(base(owned)));
});
test('judge can manage registration, payments, round preparation, launch and rollback',async()=>{
  await expect(organizer.http.post(`${base(cup)}/judges`,{userId:judge.id}));
  await expect(judge.http.post(`${base(cup)}/publish`));
  await expect(judge.http.post(`${base(cup)}/participants/bulk`,{names:'One\nTwo\nThree\nFour'}),201);
  const detail=await expect(judge.http.get(base(cup)));
  await expect(judge.http.patch(`${base(cup)}/participants/${detail.participants[0].id}/payment`,{paid:true}));
  await expect(judge.http.post(`${base(cup)}/registration/close`));
  const prepared=await expect(judge.http.post(`${base(cup)}/rounds/next`));
  assert.ok(prepared.rounds.length);
  await expect(judge.http.post(`${base(cup)}/start`));
  await expect(judge.http.del(`${base(cup)}/rounds/latest`));
});
test('expiry, account suspension and owner protections take effect on existing sessions',async()=>{
  await expect(organizer.http.post(`${base(cup)}/judges`,{userId:judge.id,expiresAt:new Date(Date.now()+60000).toISOString()}));
  await getPool().query('UPDATE tournament_judges SET expires_at=NOW()-INTERVAL \'1 second\' WHERE user_id=$1',[judge.id]);
  await expect(judge.http.get(base(cup)),403);
  await expect(admin.http.patch(`/api/admin/users/${owner.id}/permissions`,{isAdmin:false}),403);
  await expect(admin.http.post(`/api/admin/users/${owner.id}/reset-password`),403);
  await expect(owner.http.patch(`/api/admin/users/${owner.id}/permissions`,{isAdmin:false}),400);
  await expect(owner.http.del(`/api/admin/users/${owner.id}`),400);
  await expect(admin.http.patch(`/api/admin/users/${player.id}/suspension`,{until:new Date(Date.now()+60000).toISOString(),reason:'Test suspension'}));
  await expect(player.http.get('/api/me')).then(result=>assert.equal(result.user,null));
  await expect(player.http.post('/api/login',{name:player.name,password:'password123'}),403);
});
test('only super administrator transfers tournament ownership; previous organizer loses inherited access',async()=>{
  await expect(organizer.http.patch(`${base(cup)}/owner`,{userId:player.id,reason:'Transfer'}),403);
  await expect(owner.http.patch(`${base(cup)}/owner`,{userId:player.id,reason:'New organizer'}));
  assert.equal((await expect(player.http.get(base(cup)))).tournament.ownerUserId,player.id);
  await expect(player.http.post(`${base(cup)}/judges`,{userId:judge.id}));
  await expect(organizer.http.get(base(cup)),403);
  const log=await expect(owner.http.get('/api/admin/audit'));
  assert.ok(log.events.some(event=>event.event_type==='organizer_changed'));
});
test('public setup endpoint cannot claim platform ownership',async()=>{
  await expect(createClient(server.baseUrl).post('/api/setup-admin',{name:'Attacker',password:'password123'}),410);
});
