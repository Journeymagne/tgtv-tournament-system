const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../../public/studio/cloud');
const model = require('../../public/studio/model');
const memory = () => {
 const values = new Map();
 return {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key), keys:()=>[...values.keys()], get length(){return values.size}, key:index=>[...values.keys()][index]??null};
};
function harness(storage=memory()) {
 const project=model.newProject('team','Team'), calls=[], cleaned=[];
 const server={teams:[{id:'team',name:'Team',revision:1}],deletedIds:[],failDelete:false,failRename:false};
 const cloud=create({storage,schedule:null,loadProject:async()=>JSON.stringify(project),onRemove:async id=>cleaned.push(id),onRename:async(id,name)=>project.team.name=name,request:async(url,options)=>{
  calls.push({url,...options});let value;
  if(url==='/api/session')value={csrfToken:'token'};
  else if(url==='/api/drafts')value={teams:server.teams,deletedIds:server.deletedIds};
  else if(options.method==='DELETE') {
   if(server.failDelete)return {ok:false,status:503,json:async()=>({error:'Unavailable'})};
   server.teams=[];server.deletedIds=['team'];value={id:'team',deleted:true};
  } else if(options.method==='PATCH'){
   if(server.failRename)return {ok:false,status:503,json:async()=>({error:'Unavailable'})};
   const body=JSON.parse(options.body);value={id:'team',name:body.name,revision:body.revision+1};
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

test('rename preserves dirty edits and the next autosave uses the new name and revision', async()=>{
 const h=harness();await h.cloud.connect();h.project.strategicPloys[0].body='Private edit';h.cloud.track(h.project);
 await h.cloud.rename('team','New name',1);
 assert.equal(h.cloud.state('team').name,'New name');assert.equal(h.cloud.state('team').dirty,true);
 assert.equal(h.project.strategicPloys[0].body,'Private edit');
 await h.cloud.flush();const body=JSON.parse(h.calls.find(c=>c.method==='PUT').body);
 assert.equal(body.revision,2);assert.equal(body.project.team.name,'New name');assert.equal(body.project.strategicPloys[0].body,'Private edit');
});

test('a failed rename does not change the local name or revision and allows retry', async()=>{
 const h=harness();await h.cloud.connect();h.server.failRename=true;
 await assert.rejects(h.cloud.rename('team','New name',1),/Unavailable/);
 assert.equal(h.project.team.name,'Team');assert.equal(h.cloud.state('team').revision,1);
 h.server.failRename=false;await h.cloud.rename('team','New name',1);assert.equal(h.project.team.name,'New name');
});

test('renaming from a newer listing never advances an old editor past content it has not loaded', async()=>{
 const h=harness();await h.cloud.connect();h.server.teams[0].revision=3;await h.cloud.connect(true);
 await h.cloud.rename('team','New name',3);
 assert.equal(h.cloud.state('team').revision,1);assert.equal(h.cloud.state('team').remoteRevision,4);
 assert.equal(h.cloud.state('team').conflict,true);h.cloud.track(h.project);await h.cloud.flush();
 const upload=JSON.parse(h.calls.find(c=>c.method==='PUT').body);
 assert.equal(upload.revision,1);assert.notEqual(upload.recoveryId,'team');
});

test('tracked edits upload without reading browser storage or another tab\'s project', async()=>{
 const uploads=[];
 const cloud=create({storage:memory(),schedule:null,loadProject:async()=>{throw Error('Quota exceeded')},request:async(url,options)=>{
  let value=url==='/api/session'?{csrfToken:'token'}:{teams:[]};
  if(options.method==='PUT'){const body=JSON.parse(options.body);uploads.push(body.project);value={id:body.project.team.id,name:body.project.team.name,revision:1}}
  return {ok:true,json:async()=>value};
 }});
 const project=model.newProject('memory-only','My edits');cloud.track(project);
 project.team.name='Other tab';await cloud.flush();
 assert.equal(uploads.length,1);assert.equal(uploads[0].team.name,'My edits');
 assert.equal(cloud.state('memory-only').dirty,false);
});

test('autosave debounces edits for less than a second', async()=>{
 const callbacks=new Map(),uploads=[];let sequence=0,wait;
 const cloud=create({storage:memory(),schedule:null,delay:(fn,ms)=>{wait=ms;callbacks.set(++sequence,fn);return sequence},cancel:id=>callbacks.delete(id),loadProject:async()=>null,request:async(url,options)=>{
  let value=url==='/api/session'?{csrfToken:'token'}:{teams:[{id:'team',revision:1}]};
  if(options.method==='PUT'){uploads.push(JSON.parse(options.body));value={id:'team',revision:2}}
  return {ok:true,json:async()=>value};
 }});
 const project=model.newProject('team','First');await cloud.connect();cloud.track(project);
 project.team.name='Second';cloud.track(project);assert.equal(callbacks.size,1);assert(wait<1000);
 callbacks.values().next().value();await cloud.flush();
 assert.equal(uploads.length,1);assert.equal(uploads[0].project.team.name,'Second');
});

test('conflict recovery retains edits typed during upload and continues on the database copy', async()=>{
 const uploads=[],recovered=[];let release,started;
 const sent=new Promise(resolve=>started=resolve),held=new Promise(resolve=>release=resolve);
 const cloud=create({storage:memory(),schedule:null,loadProject:async()=>null,onRecover:(id,project)=>recovered.push({id,project}),makeId:()=> 'recovered-team',request:async(url,options)=>{
  let value=url==='/api/session'?{csrfToken:'token'}:{teams:[{id:'team',name:'Server',revision:1}]};
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);uploads.push({url,...body});
   if(url.endsWith('/team')){started();await held;value={id:'recovered-team',name:'First (копия правок)',revision:1,recoveredFrom:'team',original:{id:'team',name:'Remote edits',revision:2}}}
   else value={id:'recovered-team',name:body.project.team.name,revision:2};
  }
  return {ok:true,json:async()=>value};
 }});
 await cloud.connect();const project=model.newProject('team','First');cloud.track(project);
 const saving=cloud.save('team');await sent;
 const queuedPublish=cloud.save('team',true);
 project.team.subtitle='Typed during save';cloud.track(project);release();await saving;
 assert.equal((await queuedPublish).recoveredFrom,'team');
 assert.equal(uploads.length,1,'a queued publication must not upload stale content to the original');
 assert.equal(recovered[0].project.team.subtitle,'Typed during save');
 assert.equal(recovered[0].project.team.id,'recovered-team');
 assert.equal(cloud.state('team').revision,2);assert.equal(cloud.state('team').dirty,false);
 await cloud.flush();assert.equal(uploads[1].url,'/api/drafts/recovered-team');
 assert.equal(uploads[1].revision,1);assert.equal(uploads[1].project.team.subtitle,'Typed during save');
 assert.equal(cloud.state('recovered-team').dirty,false);
});

test('an unversioned local project cannot adopt the server revision before uploading', async()=>{
 const h=harness();h.project.team.name='Unsynced import';h.cloud.track(h.project);await h.cloud.flush();
 const upload=JSON.parse(h.calls.find(c=>c.method==='PUT').body);
 assert.equal(upload.revision,0);assert.equal(upload.project.team.name,'Unsynced import');
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

// Each instance is a real KTCloud tab, with a shared account store and the same
// persisted project key used by community.init. No tab can read another's RAM.
function recoveryHarness() {
 const storage=memory(), uploads=[], recoveries=[], removed=[];
 const original=model.newProject('team','Server'), server={revision:1,deleted:false,fail:true};
 storage.setItem('kt-studio-cards-v6:team',JSON.stringify(original));
 let sequence=0;
 function tab(accountStorage=storage) {
  return create({storage:accountStorage,schedule:null,makeId:()=>`recovery-${++sequence}`,
   loadProject:async id=>accountStorage.getItem('kt-studio-cards-v6:'+id),
   onRemove:async id=>{removed.push(id);accountStorage.removeItem('kt-studio-cards-v6:'+id)},
   onRecover:async(id,project)=>{recoveries.push({id,project});accountStorage.setItem('kt-studio-cards-v6:'+project.team.id,JSON.stringify(project))},
   request:async(url,options={})=>{
    let value;
    if(url==='/api/session')value={csrfToken:'token'};
    else if(url==='/api/drafts')value={teams:server.deleted?[]:[{id:'team',name:'Server',revision:server.revision}],deletedIds:server.deleted?['team']:[]};
    else if(options.method==='PUT'){
     if(server.fail)return {ok:false,status:503,json:async()=>({error:'Offline'})};
     const body=JSON.parse(options.body);uploads.push({url,...body});
     if(server.hold){const hold=server.hold;server.hold=null;hold.started();await hold.wait}
     if(body.revision!==server.revision)value={id:body.recoveryId,name:body.project.team.name,revision:1,recoveredFrom:'team',original:{id:'team',name:'Server',revision:server.revision}};
     else value={id:'team',name:body.project.team.name,revision:++server.revision};
    }else if(options.method==='DELETE'){server.deleted=true;value={id:'team',deleted:true}}
    else value={id:'team',name:'Server',revision:server.revision,project:original};
    return {ok:true,status:200,json:async()=>structuredClone(value)};
   }});
 }
 function edit(cloud,name){const project=model.newProject('team',name);project.strategicPloys[0].body=name+' private rule';storage.setItem('kt-studio-cards-v6:team',JSON.stringify(project));cloud.track(project);return project}
 return {storage,uploads,recoveries,removed,server,tab,edit};
}

test('failed persisted upload survives a clean tab refresh and editor restart with its base revision',async()=>{
 const h=recoveryHarness(),a=h.tab(),b=h.tab();await a.connect();await b.connect();
 h.edit(a,'Unsynced edit');await assert.rejects(a.save('team'),/Offline/);
 await b.connect(true); // The clean tab rewrites the old shared metadata object.
 const restarted=h.tab();await restarted.connect();
 assert.equal(restarted.state('team').dirty,true,'restart must protect persisted local content before community.init can adopt the server copy');
 h.server.revision=2;await restarted.connect(true);h.server.fail=false;await restarted.flush();
 assert.equal(h.uploads.length,1);assert.equal(h.uploads[0].revision,1,'keep the edited snapshot base revision');
 assert.equal(h.uploads[0].project.team.name,'Unsynced edit');
 assert.equal(h.uploads[0].project.strategicPloys[0].body,'Unsynced edit private rule');
 assert.equal(h.recoveries[0].project.team.name,'Unsynced edit');
 const clean=h.tab();await clean.connect();await clean.flush();assert.equal(h.uploads.length,1,'acknowledged recovery is not uploaded again');
});

test('restart recovers both independently dirty snapshots of one draft after clean metadata overwrite',async()=>{
 const h=recoveryHarness(),a=h.tab(),b=h.tab(),clean=h.tab();await a.connect();await b.connect();await clean.connect();
 h.edit(a,'Tab A');await assert.rejects(a.save('team'),/Offline/);
 h.edit(b,'Tab B');await assert.rejects(b.save('team'),/Offline/);
 await clean.connect(true);h.server.fail=false;
 const restarted=h.tab();await restarted.connect();await restarted.flush();
 assert.deepEqual(h.uploads.map(row=>row.project.team.name).sort(),['Tab A','Tab B']);
 assert(h.uploads.every(row=>row.revision===1),'neither pending snapshot may adopt the other tab upload revision');
 assert.equal(h.recoveries.length,1,'the second original-base snapshot receives a conflict recovery copy');
 assert.equal(new Set(h.uploads.map(row=>row.recoveryId)).size,2);
});

test('restart recovery respects deleted-draft tombstones and does not resurrect pending edits',async()=>{
 const h=recoveryHarness(),a=h.tab(),b=h.tab();await a.connect();await b.connect();
 h.edit(a,'Deleted pending edit');await assert.rejects(a.save('team'),/Offline/);
 await b.remove('team');h.server.fail=false;
 const restarted=h.tab();await restarted.connect();await restarted.flush();
 assert.deepEqual(restarted.list(),[]);assert.equal(h.uploads.length,0);
 assert.equal(h.storage.getItem('kt-studio-cards-v6:team'),null);
});

test('durable pending snapshots stay inside their account storage scope',async()=>{
 const h=recoveryHarness(),a=h.tab();await a.connect();h.edit(a,'Private account edit');await assert.rejects(a.save('team'),/Offline/);
 const otherAccount=h.tab(memory());await otherAccount.connect();h.server.fail=false;await otherAccount.flush();
 assert.equal(otherAccount.state('team').dirty,false);assert.equal(h.uploads.length,0);
 const restarted=h.tab();await restarted.connect();await restarted.flush();
 assert.equal(h.uploads[0]?.project.team.name,'Private account edit');
});

test('acknowledging one tab snapshot cannot erase another tab unacknowledged snapshot',async()=>{
 const h=recoveryHarness(),a=h.tab(),b=h.tab();await a.connect();await b.connect();h.server.fail=false;
 let started,release;const sent=new Promise(resolve=>started=resolve),wait=new Promise(resolve=>release=resolve);
 h.server.hold={started,wait};h.edit(a,'Acknowledged A');const saving=a.save('team');await sent;
 h.server.fail=true;h.edit(b,'Pending B');await assert.rejects(b.save('team'),/Offline/);
 h.server.fail=false;release();await saving;
 const restarted=h.tab();await restarted.connect();await restarted.flush();
 assert.deepEqual(h.uploads.map(row=>row.project.team.name),['Acknowledged A','Pending B']);
 assert.equal(h.uploads[1].revision,1,'the remaining snapshot retains its own base after another tab acknowledges revision 2');
});

test('legacy dirty metadata still uploads its persisted project after restart',async()=>{
 const h=recoveryHarness(),project=model.newProject('team','Legacy local edit');
 h.storage.setItem('kt-studio-cards-v6:team',JSON.stringify(project));
 h.storage.setItem('kt-studio-cloud-v1',JSON.stringify({team:{id:'team',name:'Legacy local edit',revision:1,dirty:true}}));
 h.server.revision=2;h.server.fail=false;
 const restarted=h.tab();await restarted.connect();await restarted.flush();
 assert.equal(h.uploads[0].revision,1);assert.equal(h.uploads[0].project.team.name,'Legacy local edit');
});
