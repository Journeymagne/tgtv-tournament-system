(function(root){
'use strict';
// Each account (and each guest tab) gets its own small-save and album stores.
function create({storage,databaseName,memoryFallback=false}){
const marker='{"storage":"kill-team-album"}',versions=new Map(),memory=new Map();
let database,queue=Promise.resolve();
function open(){
 if(!root.indexedDB)return Promise.reject(Error('Хранилище альбома недоступно'));
 if(!database)database=new Promise((resolve,reject)=>{const request=root.indexedDB.open(databaseName,1);request.onupgradeneeded=()=>request.result.createObjectStore('projects');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 return database;
}
async function write(key,value){const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
async function read(key){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('projects').objectStore('projects').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function remove(key){const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').delete(key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
function save(key,value){
 if(memoryFallback)memory.set(key,value);
 const version=(versions.get(key)||0)+1;versions.set(key,version);
 try{const previous=storage.getItem(key);storage.setItem(key,value);if(previous===marker||database){const cleanup=async()=>{if(versions.get(key)===version)try{await remove(key)}catch{}};queue=queue.then(cleanup,cleanup)}return Promise.resolve(true)}catch{}
 const job=async()=>{
  if(versions.get(key)!==version)return true;
  try{await write(key,value);if(versions.get(key)===version)storage.setItem(key,marker);return true}catch{return memoryFallback}
 };
 queue=queue.then(job,job);return memoryFallback?Promise.resolve(true):queue;
}
async function load(key){if(memory.has(key))return memory.get(key);await queue;let value;try{value=storage.getItem(key)}catch(error){if(memoryFallback)return null;throw error}if(value===marker){value=await read(key);if(!value)throw Error('Не найден сохранённый альбом')}if(memoryFallback&&value)memory.set(key,value);return value}
function discard(key){
 versions.set(key,(versions.get(key)||0)+1);
 memory.delete(key);
 let previous;try{previous=storage.getItem(key);storage.removeItem(key)}catch(error){if(!memoryFallback)throw error}
 const job=async()=>{if(previous===marker||database)await remove(key)};
 queue=queue.then(job,job);return queue;
}
return {save,load,remove:discard,flush:()=>memoryFallback?Promise.resolve():queue};
}
root.KTStorage={...create({...root.KTAccount,memoryFallback:!!root.KTAccount.id}),create};
})(typeof window!=='undefined'?window:globalThis);
