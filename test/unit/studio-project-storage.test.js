const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../public/studio/project-storage.js'), 'utf8');
function boot(storage, id = 1, indexedDB) {
 const root = { KTAccount: { id, storage, databaseName: 'test' }, indexedDB };root.window = root;
 vm.runInNewContext(source, root);return root.KTStorage;
}
test('account snapshots remain available when localStorage and IndexedDB cannot save', async () => {
 const unavailable = { getItem: () => { throw Error('Blocked'); }, setItem: () => { throw Error('Quota'); }, removeItem: () => {} };
 const account = boot(unavailable);
 assert.equal(await account.save('project', 'account changes'), true);
 assert.equal(await account.load('project'), 'account changes');
 await account.remove('project');assert.equal(await account.load('project'), null);
 assert.equal(await boot(unavailable, null).save('project', 'guest changes'), false);
});
test('two tabs retain their own snapshots even when browser recovery storage is shared', async () => {
 const values = new Map(),storage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key) };
 const first = boot(storage),second = boot(storage);
 await first.save('project', 'first tab');await second.save('project', 'second tab');
 assert.equal(await first.load('project'), 'first tab');assert.equal(await second.load('project'), 'second tab');
});

// Transaction-level IDB double: values belong to a named persisted database,
// never to the KTStorage instance or its in-memory fallback.
function persistedIndexedDB({failWrites=false,failReads=false}={}) {
 const databases=new Map();
 return {open(name){
  const request={};queueMicrotask(()=>{
   const fresh=!databases.has(name);if(fresh)databases.set(name,new Map());const records=databases.get(name);
   request.result={createObjectStore(){},transaction(){
    const tx={error:Error('IndexedDB unavailable')};
    const read=value=>{const op={};queueMicrotask(()=>{if(failReads){op.error=Error('IndexedDB read failed');op.onerror?.()}else{op.result=value;op.onsuccess?.()}});return op};
    const write=action=>queueMicrotask(()=>{if(failWrites)tx.onerror?.();else{action();tx.oncomplete?.()}});
    tx.objectStore=()=>({put:(value,key)=>write(()=>records.set(key,value)),delete:key=>write(()=>records.delete(key)),get:key=>read(records.get(key)),getAllKeys:()=>read([...records.keys()])});return tx;
   }};
   if(fresh)request.onupgradeneeded?.();request.onsuccess?.();
  });return request;
 }};
}
function quotaStorage(limit=1024){
 const values=new Map();
 return {getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(value.length>limit)throw Error('Quota exceeded');values.set(key,value)},removeItem:key=>values.delete(key),keys:()=>[...values.keys()]};
}
const journal=(storage,indexedDB,id=1)=>boot(storage,id,indexedDB).create({storage,databaseName:'test-user-'+id+'-pending',memoryFallback:false,journal:true});

for(const limit of [1024,0])test(`large pending journal survives restart through IndexedDB with ${limit?'small-marker space':'completely full localStorage'}`,async()=>{
 const storage=quotaStorage(limit),indexedDB=persistedIndexedDB(),pending=journal(storage,indexedDB);
 const payload=JSON.stringify({project:{image:'data:image/png;base64,'+'A'.repeat(5000)},revision:1});
 assert.equal(await pending.save('pending-snapshot-a',payload),true);
 assert.notEqual(storage.getItem('pending-snapshot-a'),payload,'large recovery JSON is not kept in raw localStorage');
 const restarted=journal(storage,indexedDB);
 assert.deepEqual([...await restarted.keys()],['pending-snapshot-a']);
 assert.equal(await restarted.load('pending-snapshot-a'),payload);
 const otherAccount=journal(quotaStorage(limit),indexedDB,2);assert.deepEqual([...await otherAccount.keys()],[]);
 await restarted.remove('pending-snapshot-a');
 assert.deepEqual([...await journal(storage,indexedDB).keys()],[],'acknowledgement removes the IDB payload even without a localStorage marker');
});

test('journal refuses a false durable success when both localStorage and IndexedDB writes fail',async()=>{
 const storage=quotaStorage(0),indexedDB=persistedIndexedDB({failWrites:true}),pending=journal(storage,indexedDB);
 assert.equal(await pending.save('pending-snapshot-a','private edits'),false);
 assert.equal(await pending.load('pending-snapshot-a'),null);
 assert.deepEqual([...await journal(storage,indexedDB).keys()],[]);
});

test('journal discovery and payload read failures remain visible instead of reporting no pending edits',async()=>{
 const storage=quotaStorage(0),indexedDB=persistedIndexedDB({failReads:true}),pending=journal(storage,indexedDB);
 assert.equal(await pending.save('pending-snapshot-a','private edits'),true);
 const restarted=journal(storage,indexedDB);
 assert.equal(typeof restarted.keys,'function','journal discovery is available before checking its failure');
 await assert.rejects(restarted.keys(),/IndexedDB read failed/);
 await assert.rejects(restarted.load('pending-snapshot-a'),/IndexedDB read failed/);
});
