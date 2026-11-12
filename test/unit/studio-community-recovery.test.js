const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {setImmediate:nextTurn}=require('node:timers/promises');
const Cloud=require('../../public/studio/cloud');
const Model=require('../../public/studio/model');
const source=fs.readFileSync(require('node:path').join(__dirname,'../../public/studio/community.js'),'utf8');
function memory(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),keys:()=>[...values.keys()]};}

function communityTab({storage,request,beforeOpenData}){
 const projectKey='kt-studio-cards-v6:team',listeners=new Map(),nodes=new Map(),toasts=[];
 let editor=JSON.parse(storage.getItem(projectKey)),cloud;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{dataset:{},classList:{toggle(){},add(){}},addEventListener(){},setAttribute(){}});return nodes.get(selector)};
 const document={querySelector:node,querySelectorAll:()=>[],addEventListener:(name,listener)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(listener)}};
 const journal={save:async(key,value)=>{storage.setItem(key,value);return true},load:async key=>storage.getItem(key),remove:async key=>storage.removeItem(key),keys:async()=>storage.keys()};
 const projectStorage={load:async key=>storage.getItem(key),save:async(key,value)=>{storage.setItem(key,value);return true},create:()=>journal};
 const root={location:{protocol:'http:',pathname:'/studio',search:'?resume=test',hash:''},history:{replaceState(){}},addEventListener(){},
  KTAccount:{id:1,storage,databaseName:'account-1',request,transfer:async()=>null}};
 const adapter={getData:()=>structuredClone(editor),localIds:()=>['team'],toast:message=>toasts.push(message),
  persist:async()=>projectStorage.save(projectKey,JSON.stringify(editor)),
  // Same conditional replacement contract as app.openStoredProject: persist the
  // current editor, then replace editor+ordinary project storage only if the
  // expected editor snapshot still matches after the await.
  openData:async(project,expected)=>{
   const next=Model.validate(Model.migrate(project));
   if(beforeOpenData)await beforeOpenData(next,expected);
   await adapter.persist();if(expected!==undefined&&JSON.stringify(editor)!==expected)return false;
   await projectStorage.save(projectKey,JSON.stringify(next));
   if(expected!==undefined&&JSON.stringify(editor)!==expected)return false;
   editor=next;return true;
  },
  openLocal:async()=>{editor=JSON.parse(await projectStorage.load(projectKey))},
  removeProject:async id=>storage.removeItem('kt-studio-cards-v6:'+id),
  renameProject:async(id,name)=>{editor.team.name=name},
  recoverProject:async(id,project)=>{if(editor.team.id===id)editor=structuredClone(project);await projectStorage.save('kt-studio-cards-v6:'+project.team.id,JSON.stringify(project))}
 };
 vm.runInNewContext(source,{window:root,document,KTCloud:{create:options=>cloud=Cloud.create({...options,schedule:null,delay:null})},KTStorage:projectStorage,KTModel:Model,KTCards:{esc:String},URLSearchParams,setTimeout,clearTimeout});
 return {community:root.KTCommunity,adapter,toasts,get cloud(){return cloud},get editor(){return editor},
  async openDraft(){const button={dataset:{openDraft:'team'}};for(const listener of listeners.get('click')||[])await listener({target:{closest:selector=>selector==='button'?button:null}});await nextTurn()}};
}

test('community restart hydrates active editor and ordinary storage from pending snapshot before normal upload acknowledgement',async()=>{
 const storage=memory(),projectKey='kt-studio-cards-v6:team';
 const original=Model.validate(Model.migrate(Model.newProject('team','Team')));original.strategicPloys[0].body='Old server rule';
 storage.setItem(projectKey,JSON.stringify(original));
 let remote=structuredClone(original),revision=1,offline=false,restarted;
 const uploads=[],atUpload=[];
 const request=async(url,options={})=>{
  let value;
  if(url==='/api/session')value={csrfToken:'token'};
  else if(url==='/api/drafts')value={teams:[{id:'team',name:'Team',revision}]};
  else if(options.method==='PUT'){
   if(offline)return {ok:false,status:503,json:async()=>({error:'Offline'})};
   const body=JSON.parse(options.body);uploads.push(body);
   atUpload.push({editor:restarted?.adapter.getData(),ordinary:JSON.parse(storage.getItem(projectKey))});
   assert.equal(body.revision,revision,'unchanged remote revision permits a normal acknowledgement without conflict recovery');
   remote=body.project;value={id:'team',name:remote.team.name,revision:++revision};
  }else value={id:'team',name:'Team',revision,project:remote};
  return {ok:true,status:200,json:async()=>structuredClone(value)};
 };
 const editing=Cloud.create({storage,request,schedule:null,loadProject:async()=>storage.getItem(projectKey)});
 await editing.connect();
 const clean=communityTab({storage,request});await clean.community.init(clean.adapter);
 const pending=structuredClone(original);pending.strategicPloys[0].body='Recovered private rule';
 storage.setItem(projectKey,JSON.stringify(pending));editing.track(pending);offline=true;
 await assert.rejects(editing.save('team'),/Offline/);
 // The already-connected clean tab opens the unchanged server draft and writes
 // an older ordinary project payload. The separate pending journal survives.
 await clean.openDraft();await clean.cloud.connect(true);
 assert.equal(JSON.parse(storage.getItem(projectKey)).strategicPloys[0].body,'Old server rule');
 assert(storage.keys().some(key=>key.startsWith('kt-studio-pending-v1:')));
 offline=false;restarted=communityTab({storage,request});await restarted.community.init(restarted.adapter);
 assert.equal(uploads.length,1);assert.equal(uploads[0].project.strategicPloys[0].body,'Recovered private rule');
 assert.equal(atUpload[0].editor.strategicPloys[0].body,'Recovered private rule','editor must adopt the restored active snapshot before it is acknowledged as clean');
 assert.equal(atUpload[0].ordinary.strategicPloys[0].body,'Recovered private rule','ordinary recovery storage must agree with the active journal payload before acknowledgement');
 assert.equal(restarted.editor.strategicPloys[0].body,'Recovered private rule');
 restarted.editor.team.subtitle='A subsequent edit';
 await restarted.adapter.persist();restarted.community.track(restarted.adapter.getData());await restarted.community.flush();
 assert.equal(uploads.length,2);assert.equal(uploads[1].revision,2);
 assert.equal(uploads[1].project.strategicPloys[0].body,'Recovered private rule','the next edit must not replace recovered content with the stale pre-restart editor');
 assert.equal(uploads[1].project.team.subtitle,'A subsequent edit');
 assert.deepEqual(restarted.toasts,[]);
});

test('pending adoption interrupted by a newer editor edit preserves both pending branches',{timeout:5000},async()=>{
 const storage=memory(),projectKey='kt-studio-cards-v6:team';
 const original=Model.validate(Model.migrate(Model.newProject('team','Team')));original.strategicPloys[0].body='Old ordinary rule';
 storage.setItem(projectKey,JSON.stringify(original));
 let uploads=0;
 const request=async(url,options={})=>{
  if(options.method==='PUT'){uploads++;return {ok:false,status:503,json:async()=>({error:'Offline'})}}
  return {ok:true,json:async()=>url==='/api/session'?{csrfToken:'token'}:{teams:[{id:'team',name:'Team',revision:1}]}};
 };
 const editing=Cloud.create({storage,request,schedule:null,loadProject:async()=>storage.getItem(projectKey)});
 await editing.connect();const pending=structuredClone(original);pending.strategicPloys[0].body='Recovered private rule';editing.track(pending);
 await assert.rejects(editing.save('team'),/Offline/);
 const pendingKey=storage.keys().find(key=>key.startsWith('kt-studio-pending-v1:'));
 let began,release;const adopting=new Promise(resolve=>began=resolve),held=new Promise(resolve=>release=resolve);
 const restarted=communityTab({storage,request,beforeOpenData:async(project,expected)=>{
  assert.equal(project.strategicPloys[0].body,'Recovered private rule');assert.equal(typeof expected,'string','adoption uses the editor snapshot guard');
  began();await held;
 }});
 const initializing=restarted.community.init(restarted.adapter);
 await adopting;
 restarted.editor.team.subtitle='Typed while recovery awaits storage';
 restarted.community.track(restarted.adapter.getData());await restarted.adapter.persist();await nextTurn();
 const retained=storage.getItem(pendingKey)!==null;
 release();await initializing;
 assert(retained,'a not-yet-adopted restored snapshot is independent of edits made in the stale editor');
 assert.equal(restarted.editor.team.subtitle,'Typed while recovery awaits storage');
 assert.equal(restarted.editor.strategicPloys[0].body,'Old ordinary rule','conditional adoption must not overwrite a newer editor');
 assert.equal(uploads,1,'cancelled adoption must not acknowledge the pending snapshot during startup');
 assert.equal(storage.keys().filter(key=>key.startsWith('kt-studio-pending-v1:')).length,2,'both the recovered payload and the newer editor branch remain recoverable');
});
