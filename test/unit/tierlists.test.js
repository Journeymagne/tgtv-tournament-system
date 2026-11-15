const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const domain = require('../../src/domain/tierlists');
const api = require('../../src/api/tierlists');
const routes = require('../../src/api/routes-tierlists');
const rows = () => ({ S:['a'], A:[], B:[], C:[], F:[], pool:['b'] });
const invalid = fn => assert.throws(fn, error => error.status === 400);
function ctx() {
  const req = { headers: { cookie: 'sid=session-a', host: 'localhost:3000', origin:'http://localhost:3000' }, socket:{} };
  req.headers['x-tierlist-account']='7';
  req.headers['x-csrf-token']=api.csrfToken(req);
  return { user:{id:7},req };
}

test('tierlists preserve ranking order, append newly added catalogue teams only to the pool', () => {
  const value = rows();
  assert.deepEqual(domain.normalizeRows(value, ['a','b','new-team']), {...value,pool:['b','new-team']});
  assert.deepEqual(value,rows());
});
test('tierlists reject duplicate, unknown and invented-rank content', () => {
  invalid(() => domain.normalizeRows({...rows(),F:['a']},['a','b']));
  invalid(() => domain.normalizeRows({...rows(),pool:['unknown']},['a','b']));
  invalid(() => domain.normalizeRows({...rows(),D:[]},['a','b']));
  invalid(() => domain.normalizeRows({...rows(),pool:{}},['a','b']));
});
test('tierlist title, owner spoofing and revision shape are validated', () => {
  const base={title:'  Test  ',seasonId:'2026-q3-dataslate',rows:rows()};
  assert.equal(domain.payload(base,['a','b']).title,'Test');
  invalid(() => domain.payload({...base,userId:999},['a','b']));
  invalid(() => domain.payload({...base,title:' '},['a','b']));
  invalid(() => domain.payload({...base,title:'a'.repeat(121)},['a','b']));
  invalid(() => domain.payload({...base,title:'hello\nworld'},['a','b']));
  invalid(() => domain.payload({...base,seasonId:'no space allowed'},['a','b']));
  invalid(() => domain.payload({...base,revision:0},['a','b'],true));
  invalid(() => domain.payload({...base,revision:'1'},['a','b'],true));
  assert.equal(domain.validId(randomUUID()),true);
  assert.equal(domain.validId('42'),false);
});
test('tierlist season default observes exact start/end boundaries and keeps old seasons selectable', () => {
  const seasons=[
    {id:'old',label:'Old',starts_at:null,ends_at:'2026-09-26T00:00:00+04:00'},
    {id:'new',label:'New',starts_at:'2026-09-26T00:00:00+04:00',ends_at:null}
  ];
  assert.equal(domain.seasonsView(seasons,Date.parse('2026-09-25T19:59:59Z')).currentSeasonId,'old');
  const current=domain.seasonsView(seasons,Date.parse('2026-09-25T20:00:00Z'));
  assert.equal(current.currentSeasonId,'new');
  assert.equal(current.seasons[0].isActive,false);
  assert.equal(current.seasons.length,2);
});
test('tierlist mutations bind CSRF to both the current account and session', () => {
  const context=ctx();
  assert.doesNotThrow(()=>api.authorize(context,true));
  assert.throws(()=>api.authorize({...context,user:null},true),e=>e.status===401);
  assert.throws(()=>api.authorize({...context,user:{id:8}},true),e=>e.status===401);
  const changed=ctx();changed.req.headers.cookie='sid=session-b';
  assert.throws(()=>api.authorize(changed,true),e=>e.status===403);
  const cross=ctx();cross.req.headers.origin='https://attacker.example';
  assert.throws(()=>api.authorize(cross,true),e=>e.status===403);
  const malformed=ctx();malformed.req.headers['x-csrf-token']='й'.repeat(64);
  assert.throws(()=>api.authorize(malformed,true),e=>e.status===403);
});
test('all tierlist saved-state routes require account auth and mutations are transactional and bounded', () => {
  for(const route of routes){
    if(['/api/tierlists/catalog','/api/tierlists/seasons'].includes(route.path)){
      assert.equal(route.method,'GET');continue;
    }
    assert.equal(route.auth,'user');
    if(['POST','PATCH','DELETE'].includes(route.method)){
      assert.equal(route.tx,true);
      assert.ok(route.maxBodyBytes<=32768);
    }
  }
});
