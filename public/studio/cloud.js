(function(root){
'use strict';
const META='kt-studio-cloud-v1',REMOVED='kt-studio-deleted-v1',PENDING='kt-studio-pending-v1:';
function create({request,storage,journal,loadProject,onChange=()=>{},onRemove=()=>{},onRename=()=>{},onRecover=()=>{},beforeSave=async()=>true,schedule=root.setInterval,delay=schedule?root.setTimeout:null,cancel=root.clearTimeout,makeId=()=> 'custom-'+root.crypto.randomUUID()}){
 let records={};try{records=JSON.parse(storage.getItem(META)||'{}')}catch{}
 if(!records||Array.isArray(records)||typeof records!=='object')records={};
 const entries=new Map(Object.entries(records)),generation=new Map(),snapshots=new Map(),recoveries=new Map(),deleted=new Set(),removing=new Set();
 const pending=new Map(),active=new Map(),writes=new Map(),recoveryErrors=new Map(),detached=new Set();
 const durable=journal||{save:async(key,value)=>{storage.setItem(key,value);return true},load:async key=>storage.getItem(key),remove:async key=>storage.removeItem(key),keys:async()=>storage.keys?storage.keys():Array.from({length:storage.length||0},(_,index)=>storage.key(index)).filter(Boolean)};
 let restored=false,restoring;
 let ready=false,connection=null,csrf='',queue=Promise.resolve(),saveTimer;
 function soon(){if(!delay)return;if(saveTimer)cancel(saveTimer);saveTimer=delay(()=>{saveTimer=null;void flush()},800)}
 function storedRemoved(){try{const ids=JSON.parse(storage.getItem(REMOVED)||'[]');return Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[]}catch{return []}}
 function isDeleted(id){return deleted.has(id)||storedRemoved().includes(id)}
 const heads=()=>{const superseded=new Set([...pending.values()].flatMap(record=>record.supersedes||[]));return [...pending.values()].filter(record=>!superseded.has(record.key))};
 const remaining=id=>heads().filter(record=>record.id===id);
 const lineage=record=>record?[record.key,...(record.supersedes||[]).filter(key=>pending.has(key))]:[];
 function activate(record){
  const project=record.project,id=record.id;
  active.set(id,record.key);snapshots.set(id,JSON.stringify(project));
  entries.set(id,{...entries.get(id),id,name:project.team.name,subtitle:project.team.subtitle,version:project.team.version,logo:project.team.logo||'',operativeCount:project.operatives.length,revision:record.revision,dirty:true});
 }
 async function erase(record){
  await writes.get(record.key);
  await durable.remove(record.key);pending.delete(record.key);writes.delete(record.key);
  detached.delete(record.key);
  if(active.get(record.id)===record.key)active.delete(record.id);
 }
 async function acknowledge(record){
  await erase(record);
  for(const key of record.supersedes||[]){const old=pending.get(key);if(old)await erase(old);else await durable.remove(key)}
 }
 function remember(project,revision,supersedes=[],sourceId=project.team.id,branchId){
  const id=project.team.id,key=PENDING+(root.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
  const record={key,id,project:JSON.parse(JSON.stringify(project)),revision:revision??0,recoveryId:makeId(),supersedes,sourceId,branchId:branchId||key,persisted:false};
  pending.set(key,record);active.set(id,key);
  // Only this editing lineage is superseded. Another tab's independent snapshot
  // has a different immutable key and must survive both edits and acknowledgements.
  const writing=(async()=>{
   try{
    if(!await durable.save(key,JSON.stringify(record)))throw Error('Браузер не смог сохранить копию правок для восстановления. Не закрывайте вкладку до сохранения в аккаунте.');
    record.persisted=true;
    for(const oldKey of supersedes){const old=pending.get(oldKey);if(old){await erase(old)}else await durable.remove(oldKey)}
    recoveryErrors.delete(id);return true;
   }catch(error){recoveryErrors.set(id,'Локальная копия для восстановления не сохранена: '+error.message);const entry=entries.get(id);if(entry){entry.error=recoveryErrors.get(id);notify()}return false}
  })();
  writes.set(key,writing);return record;
 }
 async function restore(){
  if(restored)return;if(restoring)return restoring;
  restoring=(async()=>{
   await Promise.all([...writes.values()]);
   for(const key of await durable.keys()){
    if(!key.startsWith(PENDING)||pending.has(key))continue;
    const text=await durable.load(key);if(!text)throw Error('Не найдена локальная копия правок для восстановления.');
    const record=JSON.parse(text);
    if(record.key!==key||record.id!==record.project?.team?.id||!Number.isInteger(record.revision)||record.revision<0)throw Error('Повреждена локальная копия правок для восстановления.');
    if(isDeleted(record.id)){await durable.remove(key);continue}
    record.persisted=true;pending.set(key,record);detached.add(key);
   }
   // A restart during supersession can leave both immutable records. The newer
   // payload names its ancestors, so only its own obsolete copies are removed.
   for(const record of [...pending.values()])if(record.persisted)for(const key of record.supersedes||[]){const old=pending.get(key);if(old&&(old.id===record.id||old.id===record.sourceId))await erase(old)}
   for(const record of heads())if(!active.has(record.id))activate(record);
   restored=true;
  })().finally(()=>restoring=null);
  return restoring;
 }
 async function forget(id){
  deleted.add(id);entries.delete(id);generation.delete(id);snapshots.delete(id);recoveries.delete(id);
  try{storage.setItem(REMOVED,JSON.stringify([...new Set([...storedRemoved(),...deleted])]))}catch{}
  for(const record of [...pending.values()].filter(record=>record.id===id))await erase(record);active.delete(id);recoveryErrors.delete(id);
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
   await restore();
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
     publicationId:remote.publicationId,publishedAt:remote.publishedAt,approval:remote.approval,dirty:!!local?.dirty});
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
  const previousRecord=pending.get(active.get(id));
  // A restored payload is independent of the editor until the adapter adopts
  // it. Edits made while adoption awaits storage must preserve both branches.
  const independent=detached.has(previousRecord?.key);
  remember(project,previous?.revision,independent?[]:lineage(previousRecord),id,independent?undefined:previousRecord?.branchId||previousRecord?.key);
  generation.set(id,(generation.get(id)||0)+1);notify();
  // Upload this tab's snapshot, independent of browser storage and other tabs.
  if(!previous)void save(id).catch(()=>{});else soon();
 }
 function save(id,publish=false,pendingKey){
  const job=queue.then(async()=>{
   if(recoveries.has(id)&&!remaining(id).length)return {...entries.get(recoveries.get(id)),recoveredFrom:id};
   if(isDeleted(id)){await forget(id);return}
   let entry=entries.get(id);
   if(!entry||(!entry.dirty&&!publish))return entry;
   try{
    await connect();entry=entries.get(id);
    if(!entry||isDeleted(id))return;
    if(pendingKey&&!pending.has(pendingKey))return entry;
    const candidate=pendingKey||active.get(id);
    if(!await beforeSave(id,candidate,active.get(id)===candidate&&detached.has(candidate)))throw Error('Проект изменился во время восстановления. Повторите сохранение.');
    if(pendingKey&&!pending.has(pendingKey))return entries.get(id);
    if(pendingKey)activate(pending.get(pendingKey));
    entry=entries.get(id);
    const version=generation.get(id)||0,project=JSON.parse(snapshots.get(id)||await loadProject(id)||'null');
    if(!project)throw Error('Не удалось прочитать правки команды.');
    const source=pending.get(active.get(id))||remember(project,entry.revision);
    await writes.get(source.key);
    entry.saving=true;notify();
    const result=await api('/api/drafts/'+encodeURIComponent(id)+(publish?'/publish':''),{
     method:publish?'POST':'PUT',body:JSON.stringify({project,revision:source.revision,recoveryId:source.recoveryId})
    });
    const latest=entries.get(id),latestRecord=pending.get(active.get(id)),changed=(generation.get(id)||0)!==version;
    const dirty=changed&&latestRecord&&(latestRecord.branchId||latestRecord.key)===(source.branchId||source.key);
    if(isDeleted(id)){await forget(id);return}
    if(result.recoveredFrom){
     const recovered=JSON.parse(dirty?snapshots.get(id)||JSON.stringify(project):JSON.stringify(project));
     recovered.team.id=result.id;
     if(recovered.team.name===project.team.name)recovered.team.name=result.name;
     const {original,recoveredFrom,...saved}=result;
     if(original)entries.set(id,{...original,remoteRevision:original.revision,dirty:false,error:'',conflict:false,saving:false});else entries.delete(id);
     await acknowledge(source);
     snapshots.delete(id);generation.delete(id);
     snapshots.set(result.id,JSON.stringify(recovered));generation.set(result.id,dirty?1:0);
     entries.set(result.id,{...saved,name:recovered.team.name,remoteRevision:result.revision,dirty,error:'',conflict:false,saving:false});
     if(dirty){const replacement=remember(recovered,result.revision,lineage(latestRecord),id,latestRecord.branchId||latestRecord.key);await writes.get(replacement.key)}
     if(!remaining(id).length)recoveries.set(id,result.id);
     const next=remaining(id)[0];if(next)activate(next);
     await onRecover(id,recovered,{activate:!changed||!!dirty});
     notify();if(dirty)soon();return result;
    }
    entries.set(id,{...latest,...result,remoteRevision:result.revision,name:dirty?latest.name:result.name,logo:dirty?latest.logo:result.logo,dirty,error:'',conflict:false,saving:false});
    await acknowledge(source);recoveryErrors.delete(id);
    if(dirty&&latestRecord&&latestRecord.key!==source.key)remember(latestRecord.project,result.revision,lineage(latestRecord),id,latestRecord.branchId||latestRecord.key);
    else {const next=remaining(id)[0];if(next)activate(next)}
    notify();if(dirty)soon();return result;
   }catch(error){
    if(error.status===410){await forget(id);throw error}
    const latest=entries.get(id);if(latest){latest.saving=false;latest.error=error.message+(recoveryErrors.has(id)?' '+recoveryErrors.get(id):'');latest.conflict=error.status===409;notify()}
    if(error.status===401||error.status===403)ready=false;
    throw error;
   }
  });
  queue=job.then(()=>{},()=>{});return job;
 }
 async function flush(){
  try{await connect()}catch(error){for(const entry of entries.values())if(entry.dirty)entry.error=error.message;notify();return}
  await Promise.all([...writes.values()]);
  const work=heads().map(record=>[record.id,record.key]);
  for(const [id,entry]of entries)if(entry.dirty&&!remaining(id).length)work.push([id,null]);
  for(const [id,key]of work)try{await save(id,false,key)}catch{}
 }
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
   const pendingRecord=pending.get(active.get(id));
   if(pendingRecord){
    const needsAdoption=detached.has(pendingRecord.key);
    const replacement=remember(JSON.parse(snapshots.get(id)),entries.get(id).revision,lineage(pendingRecord),id,pendingRecord.branchId||pendingRecord.key);
    if(needsAdoption)detached.add(replacement.key);
   }
   notify();return result;
  }).catch(async error=>{if(error.status===410)await forget(id);if(error.status===401||error.status===403)ready=false;throw error});
  queue=job.then(()=>{},()=>{});return job;
 }
 function accept(remote){if(isDeleted(remote.id))return;if(remote.project){snapshots.set(remote.id,JSON.stringify(remote.project));recoveries.delete(remote.id)}entries.set(remote.id,{...remote,project:undefined,remoteRevision:remote.revision,dirty:false,error:'',conflict:false});notify()}
 function pendingProject(id){const record=pending.get(active.get(id));return !isDeleted(id)&&record?{key:record.key,project:JSON.parse(JSON.stringify(record.project))}:null}
 function adoptPending(id,key){if(!isDeleted(id)&&active.get(id)===key)detached.delete(key)}
 if(schedule)schedule(flush,15000);
 return {connect,track,save,remove,rename,syncRemoved,isDeleted,flush,api,accept,pendingProject,adoptPending,state:id=>entries.get(id),list:()=>[...entries.values()].filter(entry=>!isDeleted(entry.id)),isReady:()=>ready};
}
root.KTCloud={create};
if(typeof module!=='undefined')module.exports=root.KTCloud;
})(typeof window!=='undefined'?window:globalThis);
