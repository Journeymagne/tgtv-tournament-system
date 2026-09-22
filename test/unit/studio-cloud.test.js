const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../../public/studio/cloud');
const model = require('../../public/studio/model');
const memory = () => {
 const values = new Map();
 return {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key)};
};
function harness(storage=memory()) {
 const project=model.newProject('team','Team'), calls=[], cleaned=[];
 const server={teams:[{id:'team',name:'Team',revision:1}],deletedIds:[],failDelete:false};
 const cloud=create({storage,schedule:null,loadProject:async()=>JSON.stringify(project),onRemove:async id=>cleaned.push(id),request:async(url,options)=>{
  calls.push({url,...options});let value;
  if(url==='/api/session')value={csrfToken:'token'};
  else if(url==='/api/drafts')value={teams:server.teams,deletedIds:server.deletedIds};
  else if(options.method==='DELETE') {
   if(server.failDelete)return {ok:false,status:503,json:async()=>({error:'Unavailable'})};
   server.teams=[];server.deletedIds=['team'];value={id:'team',deleted:true};
  } else {value={id:'team',name:'Team',revision:2};}
  return {ok:true,status:200,json:async()=>structuredClone(value)};
 }});
 return {cloud,storage,server,project,calls,cleaned};
}
test('deleted teams are removed from the queue and cannot be tracked or republished', async()=>{
 const h=harness();await h.cloud.connect();h.cloud.track(h.project);
 await h.cloud.remove('team');h.cloud.track(h.project);await h.cloud.flush();await h.cloud.save('team',true);
 assert.deepEqual(h.cloud.list(),[]);
 assert(h.cleaned.includes('team'));
 assert.equal(h.calls.filter(c=>c.method==='PUT'||c.method==='POST').length,0);
 assert.equal(JSON.parse(h.calls.find(c=>c.method==='DELETE').body).revision,1);
});
test('a failed deletion preserves the draft for retry', async()=>{
 const h=harness();await h.cloud.connect();h.server.failDelete=true;
 await assert.rejects(h.cloud.remove('team'),/Unavailable/);
 assert.equal(h.cloud.list().length,1);assert.deepEqual(h.cleaned,[]);
 h.server.failDelete=false;await h.cloud.remove('team');assert.deepEqual(h.cloud.list(),[]);
});
test('another tab receives deletion and cannot recreate the project from local metadata', async()=>{
 const storage=memory(),a=harness(storage),b=harness(storage);
 await a.cloud.connect();await b.cloud.connect();await a.cloud.remove('team');
 await b.cloud.syncRemoved();b.cloud.track(b.project);await b.cloud.flush();
 assert.deepEqual(b.cloud.list(),[]);assert.deepEqual(b.cleaned,['team']);
 assert.equal(b.calls.filter(c=>['PUT','POST'].includes(c.method)).length,0);
 const stale=harness(storage);await stale.cloud.connect();assert.deepEqual(stale.cloud.list(),[]);
});
test('refresh removes drafts deleted on another device and cleans the local project', async()=>{
 const h=harness();await h.cloud.connect();h.server.teams=[];h.server.deletedIds=['team'];
 await h.cloud.connect(true);assert.deepEqual(h.cloud.list(),[]);assert.deepEqual(h.cleaned,['team']);
});
test('deletion uses the confirmed revision even if refresh finds newer remote content', async()=>{
 const h=harness();await h.cloud.connect();h.server.teams[0].revision=3;
 await h.cloud.connect(true);await h.cloud.remove('team',1);
 assert.equal(JSON.parse(h.calls.find(c=>c.method==='DELETE').body).revision,1);
});

test('refresh never advances the revision of an editor whose newer content was not loaded', async()=>{
 const h=harness();await h.cloud.connect();h.server.teams[0].revision=3;
 await h.cloud.connect(true);assert.equal(h.cloud.state('team').revision,1);
 h.cloud.track(h.project);await h.cloud.flush();
 assert.equal(JSON.parse(h.calls.find(c=>c.method==='PUT').body).revision,1);
});
