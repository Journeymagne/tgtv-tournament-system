const test = require('node:test');
const assert = require('node:assert/strict');
const Images = require('../../public/studio/operative-image');
const Model = require('../../public/studio/model');
const large = 'data:image/png;base64,' + 'AAAA'.repeat(250);
const small = 'data:image/png;base64,' + 'AAAA'.repeat(20);
const image = (id, uri = large) => ({ ...Model.blank(id, 'operative'), image: uri, imageWidth: 960, imageHeight: 720 });

test('project resizing covers all uploaded images, shares encodes and keeps crop framing', async () => {
 const project = Model.newProject('resize');project.team.logo = large;
 project.operatives = [image('one'), image('two')];
 const crop = { x: .2, y: .1, width: .5, height: .5 };project.operatives[0].imageCrop = crop;
 project.teamCards = [{ ...image('rule'), kind: 'faction' }, { ...image('asset', 'assets/rule.png'), kind: 'faction' }];
 project.lorePages = [{ images: [{ id: 'photo', image: large }] }];
 const calls = [];
 const result = await Images.shrinkProject(project, { prepareImage: async (file, options) => {
  calls.push(options.profile);assert.equal(file.type, 'image/png');return { image: small, width: 480, height: 360 };
 } });
 assert.equal(result.changed, 5);assert.equal(result.saved, (large.length - small.length) * 5);
 assert.deepEqual(calls, ['logo', 'card', 'operative', 'page']);
 assert.equal(project.operatives[0].imageWidth, 480);assert.strictEqual(project.operatives[0].imageCrop, crop);
 assert.equal(project.teamCards[1].image, 'assets/rule.png');assert.equal(project.team.logo, small);
});

test('resizing does not overwrite images replaced, recropped or deleted during processing', async () => {
 const project = Model.newProject('resize');project.operatives = [image('one'), image('two'), image('three')];
 const original = project.operatives.slice();
 const result = await Images.shrinkProject(project, { prepareImage: async () => ({ image: small, width: 480, height: 360 }), onProgress: (done, total) => {
  if (done !== total) return;
  project.operatives[0].image = 'data:image/png;base64,changed';
  project.operatives[1].imageCrop = { x: 0, y: 0, width: .5, height: .5 };
  project.operatives.pop();
 } });
 assert.equal(result.changed, 0);assert.equal(result.skipped, 3);
 assert.equal(original[0].image, 'data:image/png;base64,changed');
 assert.equal(original[1].image, large);assert.equal(original[2].image, large);
});

test('cancelled work, failed images, tiny crops and larger encodings keep originals', async () => {
 const project = Model.newProject('resize');project.operatives = [image('one'), image('two')];
 let current = true;
 const cancelled = await Images.shrinkProject(project, { isCurrent: () => current, prepareImage: async () => { current = false;return { image: small, width: 480, height: 360 }; } });
 assert(cancelled.aborted);assert(project.operatives.every(card => card.image === large));
 project.operatives[0].imageCrop = { x: 0, y: 0, width: .002, height: .002 };
 const tiny = await Images.shrinkProject(project, { prepareImage: async () => ({ image: small, width: 480, height: 360 }) });
 assert.equal(tiny.changed, 1);assert.equal(tiny.skipped, 1);assert.equal(project.operatives[0].image, large);
 const failed = await Images.shrinkProject(project, { prepareImage: async () => { throw Error('Bad image'); } });
 assert.equal(failed.changed, 0);assert.equal(failed.skipped, 2);
 const bigger = await Images.shrinkProject(project, { prepareImage: async () => ({ image: large + 'AAAA', width: 480, height: 360 }) });
 assert.equal(bigger.changed, 0);assert.equal(project.operatives[1].image, small);
});
