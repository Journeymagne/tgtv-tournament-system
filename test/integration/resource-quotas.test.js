const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, withTransaction, withClient, closePool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { createRouter } = require('../../src/http/router');
const { createRateLimiter } = require('../../src/http/rate-limit');
const { startApiServer } = require('../helpers/client');
const auth = require('../../src/api/auth');
const access = require('../../src/db/repositories/access');
const users = require('../../src/db/repositories/users');
const studio = require('../../src/db/repositories/studio');
const quotas = require('../../src/resources/quotas');
const model = require('../../public/studio/model');
let server, owner, admin, player, passwordHash;
const limiter = createRateLimiter({ max: 1000, windowMs: 60000 });
async function account(name, isAdmin=false) {
  const user = await withClient(client=>users.insert(client,{ name,passwordHash,rating:1000,isAdmin }));
  user.token=randomBytes(32).toString('hex');
  await getPool().query("INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')",[user.token,user.id]);
  return user;
}
async function request(actor,method,path,body,extraHeaders={}) {
  const response=await fetch(server.baseUrl+path,{method,headers:{'Content-Type':'application/json',...(actor?{Cookie:'sid='+actor.token,'X-FAQ-Account':String(actor.id),'X-Training-Account':String(actor.id)}:{}),...extraHeaders},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
async function expect(promise,status=200) {const r=await promise;assert.equal(r.status,status,JSON.stringify(r.body));return r.body;}
test.before(async()=>{
  assert.match(new URL(TEST_DATABASE_URL).pathname,/test/);
  await migrate(getPool()); passwordHash=await require('../../src/domain/passwords').hashPassword('password123');
  server=await startApiServer(createRouter(require('../../src/api/routes'),{withClient,withTransaction,loadUser:auth.loadUserFromRequest,authLimiter:limiter}));
});
test.beforeEach(async()=>{
  await getPool().query('TRUNCATE users,tournaments,player_teams,resource_budgets RESTART IDENTITY CASCADE'); limiter.reset();
  owner=await account('Owner',true);admin=await account('Administrator',true);player=await account('Player');
  await withTransaction(client=>access.initializeOwner(client,owner.id));
});
test.after(async()=>{await server?.close();await closePool();});

test('only superadmin raises quotas; changes are audited and versioned for users and admins',async()=>{
  const path=`/api/admin/users/${admin.id}/quotas`;
  await expect(request(player,'GET',path),403); await expect(request(admin,'GET',path),403);
  const before=await expect(request(owner,'GET',path));assert.equal(before.limits.teamsActive,5);
  await expect(request(admin,'PATCH',path,{overrides:{teamsActive:7},revision:0,reason:'More teams'}),403);
  await expect(request(owner,'PATCH',path,{overrides:{teamsActive:7},revision:0,reason:'More teams'},{Origin:'https://another.example'}),403);
  const updated=await expect(request(owner,'PATCH',path,{overrides:{teamsActive:7},revision:0,reason:'More teams'}));
  assert.equal(updated.limits.teamsActive,7);assert.equal(updated.revision,1);
  await expect(request(owner,'PATCH',path,{overrides:{teamsActive:8},revision:0,reason:'Stale update'}),409);
  await expect(request(owner,'PATCH',path,{overrides:{teamsActive:-1},revision:1,reason:'Invalid value'}),400);
  await expect(request(owner,'PATCH',path,{overrides:{unknown:100},revision:1,reason:'Unknown key'}),400);
  assert.equal((await expect(request(admin,'GET','/api/account/quotas'))).limits.teamsActive,7);
  const audit=await getPool().query("SELECT * FROM administrative_audit_events WHERE event_type='resource_quotas_changed'");assert.equal(audit.rowCount,1);
});

test('TTS and drafts share the byte budget, and concurrent exports cannot exceed the version limit',async()=>{
  const tts=require('../../src/db/repositories/studio-tts');
  const pack={manifest:{team:{id:'quota-tts',name:'TTS team'},cards:[],tokens:[]},byteSize:100,assets:[]};
  await withTransaction(client=>studio.save(client,player.id,model.newProject('quota-tts','TTS team'),0,false));
  const before=await withClient(client=>quotas.studioUsage(client,player.id));
  await getPool().query('INSERT INTO resource_quotas(user_id,limits,reason) VALUES($1,$2,$3)',[player.id,{studioStorageBytes:before.bytes+50},'Small fixture boundary']);
  await assert.rejects(withTransaction(client=>tts.create(client,player.id,pack)),error=>error.quota?.key==='studioStorageBytes');
  await getPool().query('UPDATE resource_quotas SET limits=$2 WHERE user_id=$1',[player.id,{ttsVersions:1}]);
  const results=await Promise.allSettled([1,2].map(()=>withTransaction(client=>tts.create(client,player.id,pack))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.quota.key,'ttsVersions');
  const usage=await withClient(client=>quotas.studioUsage(client,player.id));assert.ok(usage.bytes>before.bytes+100);
});

test('restoring a team and reopening feedback cannot bypass active quotas',async()=>{
  const first=(await expect(request(player,'POST','/api/teams',{name:'Archived team'}),201)).team;
  await expect(request(player,'POST',`/api/teams/${first.id}/archive`,{}));
  await expect(request(player,'POST','/api/teams',{name:'Current team'}),201);
  await getPool().query('INSERT INTO resource_quotas(user_id,limits,reason) VALUES($1,$2,$3)',[player.id,{teamsActive:1,feedbackOpen:1},'Small fixture boundary']);
  const restore=await request(owner,'POST',`/api/admin/teams/${first.id}/restore`,{});
  assert.equal(restore.status,409);assert.equal(restore.body.quota.key,'teamsActive');
  const old=(await expect(request(player,'POST','/api/feedback',{screen:'Test',description:'First report'}),201)).feedback;
  await expect(request(admin,'PATCH',`/api/admin/feedback/${old.id}`,{status:'resolved'}));
  await expect(request(player,'POST','/api/feedback',{screen:'Test',description:'Second report'}),201);
  const reopen=await request(admin,'PATCH',`/api/admin/feedback/${old.id}`,{status:'open'});
  assert.equal(reopen.status,409);assert.equal(reopen.body.quota.key,'feedbackOpen');
});

test('training retries and answers remain available after the new-session budget is exhausted',async()=>{
  const {randomUUID,createHash}=require('node:crypto');
  const headers={'X-CSRF-Token':createHash('sha256').update('kt-training-csrf:'+player.token).digest('hex')};
  await getPool().query('INSERT INTO resource_quotas(user_id,limits,reason) VALUES($1,$2,$3)',[player.id,{trainingHour:1},'Small fixture boundary']);
  const initial=await expect(request(player,'GET','/api/training/progress'));
  const body={sessionId:randomUUID(),mode:'mixed',revision:initial.state.revision,replaceSessionId:null};
  const started=await expect(request(player,'POST','/api/training/sessions',body,headers));
  await expect(request(player,'POST','/api/training/sessions',body,headers));
  await expect(request(player,'POST','/api/training/sessions',{...body,sessionId:randomUUID(),revision:started.state.revision,replaceSessionId:body.sessionId},headers),429);
  const first=started.state.active.items[0];
  const question=(await expect(request(player,'GET','/api/training/questions'))).questions.find(q=>q.id===first.questionId);
  await expect(request(player,'POST',`/api/training/sessions/${body.sessionId}/answers`,{revision:started.state.revision,questionId:first.questionId,questionVersion:question.version,selected:0},headers));
});

test('tournament audit is paged and retained participants consume the capacity after removal',async()=>{
  const cup=(await expect(request(admin,'POST','/api/admin/tournaments',{name:'Retained participants',format:'swiss',swissRoundCount:3,startsAt:'2027-01-01T12:00:00Z'}),201)).tournament;
  await getPool().query('INSERT INTO resource_quotas(user_id,limits,reason) VALUES($1,$2,$3)',[admin.id,{tournamentParticipants:1},'Small fixture boundary']);
  await expect(request(admin,'POST',`/api/admin/tournaments/${cup.id}/participants`,{displayName:'First participant'}),201);
  await getPool().query("UPDATE tournament_participants SET status='removed' WHERE tournament_id=$1",[cup.id]);
  const next=await request(admin,'POST',`/api/admin/tournaments/${cup.id}/participants`,{displayName:'Second participant'});
  assert.equal(next.status,409);assert.equal(next.body.quota.key,'tournamentParticipants');
  const path=`/api/admin/tournaments/${cup.id}/audit?limit=1`;
  await expect(request(player,'GET',path),403);
  const page=await expect(request(admin,'GET',path));assert.equal(page.events.length,1);assert.ok(page.pagination.total>=2);
  const second=await expect(request(admin,'GET',path+'&page=2'));assert.notEqual(page.events[0].id,second.events[0].id);
});

test('FAQ pages exclude inline media while corrections retain it, and saved search accepts long queries',async()=>{
  const id=require('node:crypto').randomUUID();
  const src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=';
  const content={category:'community',teams:['Все команды'],rulingType:'RAW',question:'Quota media '+id,answer:'A bounded image response.',topic:'Действия и способности',images:[{src,caption:'Test image'}]};
  await getPool().query('INSERT INTO faq_entries(id,content) VALUES($1,$2)',[id,content]);
  const list=await expect(request(null,'GET','/api/faq?q='+id));assert.equal(list.entries.length,1);
  assert.ok(list.entries[0].images[0].src.startsWith('/api/faq/entries/'));assert.ok(!JSON.stringify(list).includes('data:image'));
  const image=await fetch(server.baseUrl+list.entries[0].images[0].src);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');await image.arrayBuffer();
  await expect(request(null,'GET',`/api/faq/entries/${id}?edit=1`),401);
  const edit=await expect(request(player,'GET',`/api/faq/entries/${id}?edit=1`));assert.equal(edit.entry.images[0].src,src);
  const query=new URLSearchParams({savedOnly:'1'});query.append('saved',id);
  for(let i=0;i<150;i++)query.append('saved',require('node:crypto').randomUUID());
  assert.ok(query.toString().length>4000);
  const saved=await expect(request(null,'POST','/api/faq/search',{query:query.toString()}));assert.equal(saved.entries[0].id,id);
  await getPool().query('DELETE FROM faq_entries WHERE id=$1',[id]);
});

test('isolated service roles can spend quotas but only accounts can change them',{skip:process.env.RESOURCE_QUOTA_TEST_ROLES!=='1'},async()=>{
  const {SCHEMAS}=require('../../src/db/schemas');
  for(const schema of SCHEMAS)process.env[schema.toUpperCase()+'_DB_PASSWORD']=randomBytes(24).toString('hex');
  await require('../../scripts/provision-service-roles').provision();
  for(const schema of SCHEMAS) {
    await withTransaction(async client=>{
      await client.query('SET LOCAL ROLE kt_'+schema);
      assert.equal((await quotas.limits(client,player.id)).teamsActive,5);
      await quotas.spend(client,player.id,'teamsCreateDay',86400,schema);
      const rights=await client.query("SELECT has_table_privilege(current_user,'accounts.resource_quotas','UPDATE') AS edit,has_function_privilege(current_user,'accounts.resource_usage(integer)','EXECUTE') AS usage");
      assert.equal(rights.rows[0].edit,schema==='accounts');assert.equal(rights.rows[0].usage,schema==='accounts');
      if(schema==='accounts')assert.equal((await client.query('SELECT accounts.resource_usage($1) value',[player.id])).rows[0].value.teamsActive,0);
      if(schema==='studio')assert.equal((await quotas.studioUsage(client,player.id)).bytes,0);
    });
  }
});
test('concurrent administrator team creations obey the daily budget; errors roll back counters',async()=>{
  await expect(request(admin,'POST','/api/teams',{name:'First team'}),201);
  const results=await Promise.all(['Second team','Third team'].map(name=>request(admin,'POST','/api/teams',{name})));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,429]);
  assert.ok(results.find(r=>r.status===429).headers.get('retry-after'));
  assert.equal((await getPool().query('SELECT count(*)::int n FROM player_teams WHERE leader_user_id=$1',[admin.id])).rows[0].n,2);
  await expect(request(owner,'PATCH',`/api/admin/users/${admin.id}/quotas`,{overrides:{teamsCreateDay:3},revision:0,reason:'Event preparation'}));
  await expect(request(admin,'POST','/api/teams',{name:'Third team after override'}),201);
});
test('pending challenge quota and per-recipient budgets survive cancellation',async()=>{
  for(let i=0;i<3;i++) {
    const created=await expect(request(player,'POST','/api/challenges',{toUserId:admin.id}),201);
    await expect(request(player,'POST',`/api/challenges/${created.challenge.id}/cancel`,{}));
  }
  await expect(request(player,'POST','/api/challenges',{toUserId:admin.id}),429);
  assert.equal((await getPool().query("SELECT hits::int FROM resource_budgets WHERE key=$1",[`user:${player.id}:challengeDay:`])).rows[0].hits,3);
});
test('successful login limits do not count incorrect credentials, and session creation evicts oldest',async()=>{
  await getPool().query("INSERT INTO sessions(token,user_id,expires_at,created_at) SELECT 'old-'||g,$1,NOW()+INTERVAL '1 day',NOW()-g*INTERVAL '1 minute' FROM generate_series(1,10) g",[player.id]);
  await expect(request(null,'POST','/api/login',{name:player.name,password:'incorrect'}),401);
  for(let i=0;i<5;i++)await expect(request(null,'POST','/api/login',{name:player.name,password:'password123'}));
  await expect(request(null,'POST','/api/login',{name:player.name,password:'password123'}),429);
  const sessions=await getPool().query('SELECT token FROM sessions WHERE user_id=$1',[player.id]);assert.equal(sessions.rowCount,10);assert.ok(!sessions.rows.some(row=>row.token==='old-10'));
});
test('registration is limited per address, independently of deleting the created account',async()=>{
  for(let i=0;i<10;i++)await expect(request(null,'POST','/api/register',{name:'Registered '+i,password:'password123',confirmPassword:'password123',telegramContact:'@quota'+i}),201);
  await getPool().query("DELETE FROM users WHERE name='Registered 0'");
  await expect(request(null,'POST','/api/register',{name:'Registered extra',password:'password123',confirmPassword:'password123',telegramContact:'@quotaextra'}),429);
});
test('Studio serializes quota checks across projects; an existing over-quota project can shrink or be removed',async()=>{
  const a=model.newProject('quota-a','First'),b=model.newProject('quota-b','Second');
  // Small fixture quotas exercise the byte boundary without allocating a GiB.
  await getPool().query('INSERT INTO resource_quotas(user_id,limits,reason) VALUES($1,$2,$3)',[player.id,{studioProjects:1,studioStorageBytes:100000},'Test boundary']);
  const results=await Promise.allSettled([a,b].map(project=>withTransaction(client=>studio.save(client,player.id,project,0,false))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.quota.key,'studioProjects');
  const saved=(await getPool().query('SELECT project FROM studio_projects WHERE owner_id=$1',[player.id])).rows[0].project;
  await getPool().query('UPDATE resource_quotas SET limits=$2 WHERE user_id=$1',[player.id,{studioProjects:1,studioStorageBytes:1}]);
  const larger=structuredClone(saved);larger.team.name+=' a longer name';
  await assert.rejects(withTransaction(client=>studio.save(client,player.id,larger,1,false)),error=>error.quota?.key==='studioStorageBytes');
  saved.team.name='X';await withTransaction(client=>studio.save(client,player.id,saved,1,false));
  await withTransaction(client=>studio.remove(client,player.id,saved.team.id,2));
  assert.equal((await withClient(client=>quotas.studioUsage(client,player.id))).projects,0);
});
test('unfinished tournaments, Swiss rounds and bulk imports are bounded for administrators',async()=>{
  const body={name:'Quota cup',format:'swiss',swissRoundCount:3,startsAt:'2027-01-01T12:00:00Z'};
  await expect(request(admin,'POST','/api/admin/tournaments',{...body,swissRoundCount:21}),409);
  const cup=(await expect(request(admin,'POST','/api/admin/tournaments',body),201)).tournament;
  await expect(request(admin,'POST',`/api/admin/tournaments/${cup.id}/participants/bulk`,{names:Array.from({length:101},(_,i)=>'Player '+i).join('\n')}),409);
  await expect(request(admin,'POST','/api/admin/tournaments',{...body,name:'Second cup'}),201);
  await expect(request(admin,'POST','/api/admin/tournaments',{...body,name:'Third cup'}),429);
});
test('list pagination is stable, searches beyond the first page and filters tournament access before paging',async()=>{
  for(let i=0;i<24;i++)await account('Extra '+String(i).padStart(2,'0'));
  const first=await expect(request(null,'GET','/api/users?limit=10'));
  const next=await expect(request(null,'GET','/api/users?limit=10&page=2'));
  assert.equal(first.users.length,10);assert.equal(first.pagination.total,27);assert.equal(next.users.length,10);
  assert.ok(!next.users.some(row=>first.users.some(other=>other.id===row.id)));
  const search=await expect(request(null,'GET','/api/users?q=Extra%2023'));assert.equal(search.users[0].name,'Extra 23');assert.ok(search.users[0].rank>10);
  await expect(request(null,'GET','/api/users?limit=10000'),400);
  const feedback=await expect(request(admin,'GET','/api/admin/feedback'));assert.equal(feedback.pagination.total,0);
  const teams=await expect(request(admin,'GET','/api/admin/teams'));assert.equal(teams.pagination.total,0);
  const cups=await expect(request(admin,'GET','/api/admin/tournaments'));assert.equal(cups.pagination.total,0);
});
