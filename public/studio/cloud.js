(function(root){
'use strict';
const META='kt-studio-cloud-v1';
function create({request,storage,loadProject,onChange=()=>{},schedule=root.setInterval}){
 let records={};try{records=JSON.parse(storage.getItem(META)||'{}')}catch{}
 if(!records||Array.isArray(records)||typeof records!=='object')records={};
 const entries=new Map(Object.entries(records)),generation=new Map();
 let ready=false,connection=null,csrf='',queue=Promise.resolve();
 function notify(){try{storage.setItem(META,JSON.stringify(Object.fromEntries(entries)))}catch{}onChange()}
 async function api(url,options={}){
  const response=await request(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  let value;try{value=await response.json()}catch{throw Error('Серверное хранилище недоступно. Изменения остаются в браузере.')}
  if(!response.ok)throw Object.assign(Error(value.error||'Не удалось связаться с хранилищем.'),{status:response.status});
  return value;
 }
 async function connect(){
  if(ready)return;
  if(connection)return connection;
  connection=(async()=>{
   csrf=(await api('/api/session')).csrfToken;
   const result=await api('/api/drafts');
   for(const remote of result.teams){
    const local=entries.get(remote.id);
    // Never adopt a newer revision for an edited local copy: the server must detect a conflict.
    entries.set(remote.id,{...remote,...local,revision:local?.revision??remote.revision,dirty:!!local?.dirty});
   }
   ready=true;notify();
  })().finally(()=>connection=null);
  return connection;
 }
 function track(project){
  const id=project.team.id,previous=entries.get(id);
  entries.set(id,{...previous,id,name:project.team.name,subtitle:project.team.subtitle,version:project.team.version,operativeCount:project.operatives.length,revision:previous?.revision??null,dirty:true,error:previous?.conflict?previous.error:''});
  generation.set(id,(generation.get(id)||0)+1);notify();
  // The first edit creates a draft; subsequent edits are uploaded by the minute timer.
  if(!previous)void save(id).catch(()=>{});
 }
 function save(id,publish=false){
  const job=queue.then(async()=>{
   let entry=entries.get(id);
   if(!entry||(!entry.dirty&&!publish))return entry;
   if(entry.conflict)throw Error(entry.error);
   try{
    await connect();entry=entries.get(id);
    const version=generation.get(id)||0,project=JSON.parse(await loadProject(id));
    if(!project)throw Error('Локальная копия проекта не найдена.');
    entry.saving=true;notify();
    const result=await api('/api/drafts/'+encodeURIComponent(id)+(publish?'/publish':''),{
     method:publish?'POST':'PUT',body:JSON.stringify({project,revision:entry.revision??0})
    });
    const latest=entries.get(id),dirty=(generation.get(id)||0)!==version;
    entries.set(id,{...latest,...result,name:dirty?latest.name:result.name,dirty,error:'',conflict:false,saving:false});
    notify();return result;
   }catch(error){
    const latest=entries.get(id);if(latest){latest.saving=false;latest.error=error.message;latest.conflict=error.status===409;notify()}
    if(error.status===401||error.status===403)ready=false;
    throw error;
   }
  });
  queue=job.then(()=>{},()=>{});return job;
 }
 async function flush(){for(const [id,entry]of entries)if(entry.dirty&&!entry.conflict)try{await save(id)}catch{}}
 function accept(remote){entries.set(remote.id,{...remote,project:undefined,dirty:false,error:'',conflict:false});notify()}
 if(schedule)schedule(flush,60000);
 return {connect,track,save,flush,api,accept,state:id=>entries.get(id),list:()=>[...entries.values()],isReady:()=>ready};
}
root.KTCloud={create};
if(typeof module!=='undefined')module.exports=root.KTCloud;
})(typeof window!=='undefined'?window:globalThis);
