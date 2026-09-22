const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../public/studio/project-storage.js'), 'utf8');
function boot(storage, id = 1) {
 const root = { KTAccount: { id, storage, databaseName: 'test' } };root.window = root;
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
