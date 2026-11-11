const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { TEST_DATABASE_URL } = require('../helpers/db');
const { migrate } = require('../../src/db/migrate');
const api = require('../../src/api/tierlists');
const users = require('../../src/db/repositories/users');
const teams = require('../../public/tierlist/catalog.json').teams.map(team=>team.id);
let pool,client,owner,other;
const placement = () => ({S:[teams[0]],A:[],B:[],C:[],F:[],pool:teams.slice(1)});
function context(user,body={},id) {
  const req={headers:{cookie:'sid=tierlist-test-'+user.id,host:'localhost:3000',origin:'http://localhost:3000'},socket:{}};
  req.headers['x-tierlist-account']=String(user.id);req.headers['x-csrf-token']=api.csrfToken(req);
  return {client,user,req,body,query:new URLSearchParams(),params:{id}};
}
function value(overrides={}) {return {title:'My tierlist',seasonId:'2026-q3-dataslate',rows:placement(),...overrides};}
async function tx(fn){
  await client.query('BEGIN');
  try{const result=await fn();await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
}
async function create(overrides={}){return (await tx(()=>api.create(context(owner,value(overrides))))).body.tierlist;}
test.before(async()=>{
  pool=new Pool(require('../helpers/schema').poolOptions);
  await require('../helpers/schema').resetSchemas(pool);await migrate(pool);
});
test.after(async()=>{await pool.end();});
test.beforeEach(async()=>{
  client=await pool.connect();
  await client.query('TRUNCATE accounts.users RESTART IDENTITY CASCADE');
  const insert=name=>users.insert(client,{name,passwordHash:'test-only',avatarData:null,registerNickname:name,telegramContact:'@'+name,challengeCredits:[],rating:1000,isAdmin:false});
  owner=await insert('TierOwner');other=await insert('TierOther');
});
test.afterEach(()=>client.release());

test('saved tierlist belongs to the session account and retains season/placement across reads and updates',async()=>{
  const saved=await create();
  assert.equal(saved.revision,1);
  assert.deepEqual(saved.rows,placement());
  const read=(await api.get(context(owner,{},saved.id))).body.tierlist;
  assert.equal(read.seasonId,'2026-q3-dataslate');
  const updated=(await tx(()=>api.update(context(owner,value({title:'Archived season',seasonId:'2026-q2-dataslate',revision:1}),saved.id)))).body.tierlist;
  assert.equal(updated.revision,2);assert.equal(updated.seasonId,'2026-q2-dataslate');
  const listCtx=context(owner);listCtx.query.set('seasonId','2026-q2-dataslate');
  const listing=(await api.list(listCtx)).body;
  assert.equal(listing.accountId,owner.id);assert.equal(listing.tierlists.length,1);
  assert.ok(listing.csrfToken);assert.equal(listing.tierlists[0].rows,undefined);
  listCtx.query.set('seasonId','2026-q3-dataslate');
  assert.equal((await api.list(listCtx)).body.tierlists.length,0);
});
test('another account cannot list, read, overwrite or delete the owner tierlist',async()=>{
  const saved=await create();
  assert.equal((await api.list(context(other))).body.tierlists.length,0);
  await assert.rejects(()=>api.get(context(other,{},saved.id)),e=>e.status===404);
  await assert.rejects(()=>tx(()=>api.update(context(other,value({revision:1}),saved.id))),e=>e.status===404);
  await assert.rejects(()=>tx(()=>api.remove(context(other,{revision:1},saved.id))),e=>e.status===404);
  assert.equal((await api.get(context(owner,{},saved.id))).body.tierlist.revision,1);
});
test('unknown seasons and duplicated/unknown cards never persist',async()=>{
  await assert.rejects(()=>create({seasonId:'not-a-season'}),e=>e.status===400);
  await assert.rejects(()=>create({rows:{...placement(),A:[teams[0]]}}),e=>e.status===400);
  await assert.rejects(()=>create({rows:{...placement(),A:['not-a-team']}}),e=>e.status===400);
  await assert.rejects(()=>create({userId:other.id}),e=>e.status===400);
  assert.equal((await api.list(context(owner))).body.tierlists.length,0);
});
test('stale update and delete reject with conflict without losing the latest save',async()=>{
  const saved=await create();
  await tx(()=>api.update(context(owner,value({title:'Second save',revision:1}),saved.id)));
  await assert.rejects(()=>tx(()=>api.update(context(owner,value({title:'Stale save',revision:1}),saved.id))),e=>e.status===409);
  await assert.rejects(()=>tx(()=>api.remove(context(owner,{revision:1},saved.id))),e=>e.status===409);
  assert.equal((await api.get(context(owner,{},saved.id))).body.tierlist.title,'Second save');
  await tx(()=>api.remove(context(owner,{revision:2},saved.id)));
  await assert.rejects(()=>api.get(context(owner,{},saved.id)),e=>e.status===404);
});
test('missing or malformed identifiers are not found; invalid revisions cannot delete data',async()=>{
  await assert.rejects(()=>api.get(context(owner,{},'not-uuid')),e=>e.status===404);
  await assert.rejects(()=>api.get(context(owner,{},randomUUID())),e=>e.status===404);
  const saved=await create();
  await assert.rejects(()=>tx(()=>api.remove(context(owner,{revision:'1'},saved.id))),e=>e.status===400);
  assert.equal((await api.list(context(owner))).body.tierlists.length,1);
});
test('account deletion removes its private tierlists through identity lifecycle only',async()=>{
  const saved=await create();
  await client.query('DELETE FROM accounts.users WHERE id=$1',[owner.id]);
  assert.equal((await client.query('SELECT 1 FROM tierlists.saved_tierlists WHERE id=$1',[saved.id])).rowCount,0);
});
