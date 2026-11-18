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
const { startApiServer, createClient } = require('../helpers/client');
const routes = require('../../src/api/routes');
const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=';
const input = { name: 'Provider Club', city: 'Moscow', logoData };
const limiter = createRateLimiter({max:1000,windowMs:60000});
let server, chief, organizer, judge, admin, player, provider;
async function expect(request, status = 200) {
  const result = await request;
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body;
}
async function register(name) {
  const http = createClient(server.baseUrl);
  const {user} = await expect(http.post('/api/register', {name,password:'password123',confirmPassword:'password123',telegramContact:'@'+name}),201);
  return {...user,http};
}
const url = suffix => '/api/tournament-providers/'+provider.id+(suffix || '');
async function invite(person, role = 'organizer') {
  return (await expect(chief.http.post(url('/invitations'),{userId:person.id,role}),201)).invitation;
}
async function accept(person, invitation) {
  return expect(person.http.post('/api/tournament-provider-invitations/'+invitation.id+'/accept'));
}
test.before(async()=>{
  assert.match(new URL(TEST_DATABASE_URL).pathname,/test/);
  await migrate(getPool());
  server=await startApiServer(createRouter(routes,{withClient,withTransaction,loadUser:loadUserFromRequest,authLimiter:limiter}));
});
test.after(async()=>{await server?.close();await closePool();});
test.beforeEach(async()=>{
  await getPool().query('TRUNCATE users,tournaments,games,player_teams RESTART IDENTITY CASCADE');
  limiter.reset();
  chief=await register('ProviderChief');organizer=await register('ProviderOrganizer');
  judge=await register('ProviderJudge');admin=await register('ProviderAdmin');player=await register('ProviderPlayer');
  await withTransaction(c=>access.initializeOwner(c,chief.id));
  await expect(chief.http.patch('/api/admin/users/'+admin.id+'/permissions',{isAdmin:true}));
  provider=(await expect(chief.http.post('/api/tournament-providers',input),201)).provider;
});
test('only global creators create providers; mandatory profile fields and creator membership are atomic',async()=>{
  await expect(player.http.post('/api/tournament-providers',{...input,name:'Forbidden'}),403);
  await expect(chief.http.post('/api/tournament-providers',{name:'Missing image',city:'Moscow'}),400);
  const profile=await expect(player.http.get('/api/tournament-providers/'+provider.slug));
  assert.equal(profile.provider.ownerUserId,chief.id);
  assert.equal(profile.members.length,1);
  assert.equal(profile.members[0].isOwner,true);
  assert.equal(profile.provider.viewer.canManageMembers,false);
  assert.equal(profile.provider.logoData,undefined);
  await expect(player.http.get('/api/tournament-provider-logos/2147483648'),404);
  await expect(chief.http.post(url('/invitations'),{userId:'90071992547409930',role:'judge'}),400);
});
test('invited organizer can edit profile but never receives global creation or member-management rights',async()=>{
  const invitation=await invite(organizer);
  await expect(judge.http.post('/api/tournament-provider-invitations/'+invitation.id+'/accept'),403);
  await accept(organizer,invitation);
  const me=(await expect(organizer.http.get('/api/me'))).user;
  assert.equal(me.capabilities.canCreateTournaments,false);
  assert.equal(me.capabilities.canCreateProviders,false);
  const saved=await expect(organizer.http.patch(url(),{city:'Yerevan',expectedUpdatedAt:provider.updatedAt}));
  assert.equal(saved.provider.city,'Yerevan');
  await expect(organizer.http.post(url('/invitations'),{userId:player.id,role:'judge'}),403);
  await expect(organizer.http.post('/api/tournament-providers',{...input,name:'No global grant'}),403);
  await expect(organizer.http.patch(url(),{city:'Stale',expectedUpdatedAt:provider.updatedAt}),409);
});
test('judge cannot edit profile; administrators manage membership without joining',async()=>{
  await accept(judge,await invite(judge,'judge'));
  await expect(judge.http.patch(url(),{city:'Forbidden',expectedUpdatedAt:provider.updatedAt}),403);
  await expect(admin.http.patch(url('/members/'+judge.id),{role:'organizer'}));
  let profile=await expect(judge.http.get('/api/tournament-providers/'+provider.slug));
  assert.equal(profile.provider.viewer.canEdit,true);
  await expect(admin.http.patch(url('/members/'+judge.id),{role:'judge'}));
  profile=await expect(judge.http.get('/api/tournament-providers/'+provider.slug));
  assert.equal(profile.provider.viewer.canEdit,false);
  await expect(admin.http.del(url('/members/'+judge.id)));
  assert.equal((await expect(judge.http.get('/api/tournament-providers/'+provider.slug))).provider.viewer.isMember,false);
});
test('accept and revoke serialize; invitation cannot create multiple active memberships or be reused',async()=>{
  const invitation=await invite(organizer);
  const results=await Promise.all([
    organizer.http.post('/api/tournament-provider-invitations/'+invitation.id+'/accept'),
    chief.http.post('/api/tournament-provider-invitations/'+invitation.id+'/revoke')
  ]);
  assert.deepEqual(results.map(r=>r.status).sort((a,b)=>a-b),[200,409]);
  const count=await getPool().query('SELECT count(*)::int AS n FROM tournaments.tournament_provider_memberships WHERE provider_id=$1 AND user_id=$2 AND ended_at IS NULL',[provider.id,organizer.id]);
  assert.ok(count.rows[0].n<=1);
  await expect(organizer.http.post('/api/tournament-provider-invitations/'+invitation.id+'/accept'),409);
});
test('chief cannot disappear and transfer preserves one chief while recording the historical creator',async()=>{
  await accept(organizer,await invite(organizer));
  await expect(chief.http.post(url('/leave')),400);
  await expect(admin.http.patch(url('/members/'+chief.id),{role:'judge'}),400);
  await expect(chief.http.patch(url('/owner'),{userId:organizer.id}));
  const profile=await expect(organizer.http.get('/api/tournament-providers/'+provider.slug));
  assert.equal(profile.provider.ownerUserId,organizer.id);
  assert.equal(profile.members.filter(m=>m.isOwner).length,1);
  await expect(chief.http.post(url('/invitations'),{userId:player.id,role:'judge'}),201);
  await expect(organizer.http.patch(url('/owner'),{userId:chief.id}));
  await expect(organizer.http.post(url('/invitations'),{userId:judge.id,role:'judge'}),403);
});
test('archive revokes pending invitations, preserves public profile and can be restored by an administrator',async()=>{
  const invitation=await invite(organizer);
  await expect(chief.http.post(url('/archive')));
  await expect(organizer.http.post('/api/tournament-provider-invitations/'+invitation.id+'/accept'),409);
  const profile=await expect(player.http.get('/api/tournament-providers/'+provider.slug));
  assert.ok(profile.provider.archivedAt);
  await expect(admin.http.post(url('/restore')));
  assert.equal((await expect(player.http.get('/api/tournament-providers/'+provider.slug))).provider.archivedAt,null);
});
test('public groups hide drafts and images, deduplicate calendar links and paginate visible events only',async()=>{
  const tournament=(await expect(chief.http.post('/api/admin/tournaments',{
    name:'Provider Cup',providerId:provider.id,format:'swiss',swissRoundCount:3,startsAt:'2099-12-01T12:00:00Z',logoData
  }),201)).tournament;
  const hidden=await expect(player.http.get('/api/tournament-providers/'+provider.slug));
  assert.equal(hidden.counts.future,0);
  assert.equal(hidden.counts.draft,undefined);
  await expect(player.http.get(url('/events')+'?group=draft'),403);
  await expect(player.http.get('/api/tournament-logos/'+tournament.id),404);
  assert.equal((await expect(chief.http.get(url('/events')+'?group=draft'))).items.length,1);
  await getPool().query("UPDATE tournaments.tournaments SET status='registration_open' WHERE id=$1",[tournament.id]);
  const future=await expect(player.http.get(url('/events')+'?group=future'));
  assert.equal(future.items.length,1);
  assert.equal(future.items[0].kind,'tournament');
  assert.equal(future.items[0].providerId,provider.id);
  assert.equal(future.pagination.total,1);
  await getPool().query(`INSERT INTO tournaments.calendar_events
    (name,event_date,city,venue,tournament_type,participant_limit,entry_fee,provider_id)
    SELECT 'Public event '||n,'2099-12-02'::date,'Moscow','Club','solo',16,0,$1 FROM generate_series(1,25) n`,[provider.id]);
  const page1=await expect(player.http.get(url('/events')+'?group=future'));
  const page2=await expect(player.http.get(url('/events')+'?group=future&page=2'));
  assert.equal(page1.pagination.total,26);
  assert.equal(page1.items.length,20);
  assert.equal(page2.items.length,6);
  assert.equal(new Set([...page1.items,...page2.items].map(i=>i.kind+':'+i.id)).size,26);
});
test('deleting a current organization chief explains the transfer prerequisite without a server error',async()=>{
  await accept(organizer,await invite(organizer));
  await expect(chief.http.patch(url('/owner'),{userId:organizer.id}));
  const failure=await expect(chief.http.del('/api/admin/users/'+organizer.id),409);
  assert.match(failure.error,/Transfer.*organizer/i);
  await expect(chief.http.patch(url('/owner'),{userId:chief.id}));
  await expect(chief.http.del('/api/admin/users/'+organizer.id));
});
test('different Cyrillic names with the same base slug are allocated atomically',async()=>{
  const responses=await Promise.all(['Клуб Север','Клуб Юг'].map(name=>chief.http.post('/api/tournament-providers',{...input,name})));
  assert.deepEqual(responses.map(r=>r.status),[201,201]);
  assert.equal(new Set(responses.map(r=>r.body.provider.slug)).size,2);
  await expect(chief.http.post('/api/tournament-providers',{...input,name:'Cup'}),201);
  const suffixes=await Promise.all(['Cup!','Cup 2'].map(name=>chief.http.post('/api/tournament-providers',{...input,name})));
  assert.deepEqual(suffixes.map(r=>r.status),[201,201]);
  assert.equal(new Set(suffixes.map(r=>r.body.provider.slug)).size,2);
});
test('a suspended organizer cannot become chief and voluntary departure has its own audit action',async()=>{
  await accept(organizer,await invite(organizer));
  await expect(chief.http.patch('/api/admin/users/'+organizer.id+'/suspension',{until:'2099-01-01T00:00:00Z',reason:'Fixture'}));
  await expect(chief.http.patch(url('/owner'),{userId:organizer.id}),400);
  await expect(chief.http.patch('/api/admin/users/'+organizer.id+'/suspension',{}));
  await expect(organizer.http.post('/api/login',{name:organizer.name,password:'password123'}));
  await expect(organizer.http.post(url('/leave')));
  const audit=await getPool().query("SELECT event_type FROM tournaments.tournament_provider_audit_events WHERE provider_id=$1 AND event_type='member_left'",[provider.id]);
  assert.equal(audit.rows.length,1);
});
