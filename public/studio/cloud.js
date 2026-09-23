(function(root){
'use strict';
const META='kt-studio-cloud-v1',REMOVED='kt-studio-deleted-v1';
function create({request,storage,loadProject,onChange=()=>{},onRemove=()=>{},onRename=()=>{},onRecover=()=>{},schedule=root.setInterval,delay=schedule?root.setTimeout:null,cancel=root.clearTimeout,makeId=()=> 'custom-'+root.crypto.randomUUID()}){
 let records={};try{records=JSON.parse(storage.getItem(META)||'{}')}catch{}
 if(!records||Array.isArray(records)||typeof records!=='object')records={};
 const entries=new Map(Object.entries(records)),generation=new Map(),snapshots=new Map(),recoveries=new Map(),deleted=new Set(),removing=new Set();
 let ready=false,connection=null,csrf='',queue=Promise.resolve(),saveTimer;
 function soon(){if(!delay)return;if(saveTimer)cancel(saveTimer);saveTimer=delay(()=>{saveTimer=null;void flush()},800)}
 function storedRemoved(){try{const ids=JSON.parse(storage.getItem(REMOVED)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[]}catch{return []}}
 function isDeleted(id){return deleted.has(id)||storedRemoved().includes(id)}
 async function forget(id){
  deleted.add(id);entries.delete(id);generation.delete(id);snapshots.delete(id);recoveries.delete(id);
  try{storage.setItem(REMOVED,JSON.stringify([...new Set([...storedRemoved(),...deleted])]))}catch{}
  notify();await onRemove(id);
 }
 async function syncRemoved(){for(const id of storedRemoved())if(!deleted.has(id))await forget(id)}
 function notify(){try{storage.setItem(META,JSON.stringify(Object.fromEntries(entries)))}catch{}onChange()}
 async function api(url,options={}){
  const response=await request(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
  let value;try{value=await response.json()}catch{throw Error('Хранилище недоступно. Правки ещё не сохранены в аккаунте; повторите попытку.')}
  if(!response.ok)throw Object.assign(Error(value.error||'Не удалось связаться с хранилищем.'),{status:response.status});
  return value;
 }
 async function connect(refresh=false){
  if(ready&&!refresh)return;
  if(connection)return connection;
  connection=(async()=>{
   csrf=(await api('/api/session')).csrfToken;
   const result=await api('/api/drafts');
   await syncRemoved();
   for(const id of result.deletedIds||[])await forget(id);
   for(const remote of result.teams){
    if(isDeleted(remote.id))continue;
    const local=entries.get(remote.id);
    // Never adopt a newer revision for an edited local copy: the server must detect a conflict.
    // Even a clean editor may still display an older project. Advance its
    // revision only through accept(), after that project's content is loaded.
    entries.set(remote.id,{...remote,...local,name:local?.dirty?local.name:remote.name,logo:local?.dirty?local.logo:remote.logo,revision:local?(local.revision??0):remote.revision,remoteRevision:remote.revision,
     publicationId:remote.publicationId,publishedAt:remote.publishedAt,dirty:!!local?.dirty});
   }
   ready=true;notify();
  })().finally(()=>connection=null);
  return connection;
 }
 function track(project){
  const id=project.team.id,previous=entries.get(id);
  if(isDeleted(id)||removing.has(id)||recoveries.has(id))return;
  const value=JSON.stringify(project);
  if(snapshots.get(id)===value)return;
  snapshots.set(id,value);
  entries.set(id,{...previous,id,name:project.team.name,subtitle:project.team.subtitle,version:project.team.version,logo:project.team.logo||'',operativeCount:project.operatives.length,revision:previous?.revision??null,dirty:true,error:previous?.conflict?previous.error:''});
  generation.set(id,(generation.get(id)||0)+1);notify();
  // Upload this tab's snapshot, independent of browser storage and other tabs.
  if(!previous)void save(id).catch(()=>{});else soon();
 }
 function save(id,publish=false){
  const job=queue.then(async()=>{
   if(recoveries.has(id))return {...entries.get(recoveries.get(id)),recoveredFrom:id};
   if(isDeleted(id)){await forget(id);return}
   let entry=entries.get(id);
   if(!entry||(!entry.dirty&&!publish))return entry;
   try{
    await connect();entry=entries.get(id);
    if(!entry||isDeleted(id))return;
    const version=generation.get(id)||0,project=JSON.parse(snapshots.get(id)||await loadProject(id)||'null');
    if(!project)throw Error('Не удалось прочитать правки команды.');
    entry.saving=true;notify();
    const result=await api('/api/drafts/'+encodeURIComponent(id)+(publish?'/publish':''),{
     method:publish?'POST':'PUT',body:JSON.stringify({project,revision:entry.revision??0,recoveryId:makeId()})
    });
    const latest=entries.get(id),dirty=(generation.get(id)||0)!==version;
    if(isDeleted(id)){await forget(id);return}
    if(result.recoveredFrom){
     const recovered=JSON.parse(snapshots.get(id)||JSON.stringify(project));
     recovered.team.id=result.id;
     if(recovered.team.name===project.team.name)recovered.team.name=result.name;
     const {original,recoveredFrom,...saved}=result;
     if(original)entries.set(id,{...original,remoteRevision:original.revision,dirty:false,error:'',conflict:false,saving:false});else entries.delete(id);
     snapshots.delete(id);generation.delete(id);
     recoveries.set(id,result.id);
     snapshots.set(result.id,JSON.stringify(recovered));generation.set(result.id,dirty?1:0);
     entries.set(result.id,{...saved,name:recovered.team.name,remoteRevision:result.revision,dirty,error:'',conflict:false,saving:false});
     await onRecover(id,recovered);
     notify();if(dirty)soon();return result;
    }
    entries.set(id,{...latest,...result,remoteRevision:result.revision,name:dirty?latest.name:result.name,logo:dirty?latest.logo:result.logo,dirty,error:'',conflict:false,saving:false});
    notify();if(dirty)soon();return result;
   }catch(error){
    if(error.status===410){await forget(id);throw error}
    const latest=entries.get(id);if(latest){latest.saving=false;latest.error=error.message;latest.conflict=error.status===409;notify()}
    if(error.status===401||error.status===403)ready=false;
    throw error;
   }
  });
  queue=job.then(()=>{},()=>{});return job;
 }
 async function flush(){for(const [id,entry]of [...entries])if(entry.dirty)try{await save(id)}catch{}}
 function remove(id,revision=entries.get(id)?.revision??0){
  removing.add(id);
  const job=queue.then(async()=>{
   await connect();
   if(!isDeleted(id))await api('/api/drafts/'+encodeURIComponent(id),{method:'DELETE',body:JSON.stringify({revision})});
   await forget(id);
  }).finally(()=>removing.delete(id));
  queue=job.then(()=>{},()=>{});return job;
 }
 function rename(id,name,revision){
  const job=queue.then(async()=>{
   await connect();
   if(isDeleted(id))throw Error('Команда удалена.');
   const result=await api('/api/drafts/'+encodeURIComponent(id)+'/name',{method:'PATCH',body:JSON.stringify({name,revision})});
   if(snapshots.has(id)){const project=JSON.parse(snapshots.get(id));project.team.name=result.name;snapshots.set(id,JSON.stringify(project))}
   await onRename(id,result.name);
   const local=entries.get(id),sameRevision=!local||local.revision===revision;
   entries.set(id,{...result,...local,name:result.name,updatedAt:result.updatedAt,
    publicationId:result.publicationId,publishedAt:result.publishedAt,remoteRevision:result.revision,
    revision:sameRevision?result.revision:local.revision,dirty:!!local?.dirty,
    conflict:!sameRevision||!!local?.conflict,
    error:sameRevision?(local?.error||''):'Есть другая версия команды. При сохранении ваши правки попадут в отдельный черновик аккаунта.'});
   notify();return result;
  }).catch(async error=>{if(error.status===410)await forget(id);if(error.status===401||error.status===403)ready=false;throw error});
  queue=job.then(()=>{},()=>{});return job;
 }
 function accept(remote){if(isDeleted(remote.id))return;if(remote.project){snapshots.set(remote.id,JSON.stringify(remote.project));recoveries.delete(remote.id)}entries.set(remote.id,{...remote,project:undefined,remoteRevision:remote.revision,dirty:false,error:'',conflict:false});notify()}
 if(schedule)schedule(flush,15000);
 return {connect,track,save,remove,rename,syncRemoved,isDeleted,flush,api,accept,state:id=>entries.get(id),list:()=>[...entries.values()].filter(entry=>!isDeleted(entry.id)),isReady:()=>ready};
}
root.KTCloud={create};
if(typeof module!=='undefined')module.exports=root.KTCloud;
})(typeof window!=='undefined'?window:globalThis);
