const test = require('node:test');
const assert = require('node:assert/strict');
const Crop = require('../../public/studio/operative-crop');
const Model = require('../../public/studio/model');
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('crop zoom preserves the chosen centre and aspect ratio without editing the source rectangle', () => {
  const rect = { x: .1, y: .2, width: .6, height: .4 }, saved = { ...rect };
  const zoomed = Crop.zoom(rect, 2);
  near(zoomed.width, .3);near(zoomed.height, .2);
  near(zoomed.x + zoomed.width / 2, rect.x + rect.width / 2);
  near(zoomed.y + zoomed.height / 2, rect.y + rect.height / 2);
  assert.deepEqual(rect, saved);
  const restored = Crop.zoom(zoomed, .5);
  for (const key of Object.keys(rect)) near(restored[key], rect[key]);
});

test('zooming out at image edges retains proportions and keeps the crop inside the source', () => {
  for (const rect of [{ x: 0, y: 0, width: .2, height: .1 }, { x: .8, y: .9, width: .2, height: .1 }]) {
    const result = Crop.zoom(rect, .01);
    assert(Crop.valid(result));near(result.width, 1);near(result.height, .5);
    near(result.width / result.height, rect.width / rect.height);
  }
});

test('extreme zoom respects minimum source pixels and remains editable with crop handles', () => {
  const rect = { x: .2, y: .1, width: .6, height: .4 };
  const zoomed = Crop.zoom(rect, 10000, 4 / 1200, 4 / 800);
  assert(Crop.valid(zoomed));assert(zoomed.width * 1200 >= 4);assert(zoomed.height * 800 >= 4);
  near(zoomed.width / zoomed.height, 1.5);
  const moved = Crop.drag(zoomed, { x: 0, y: 0 }, { x: .1, y: .1 }, 'move');
  assert(Crop.valid(moved));near(moved.width, zoomed.width);near(moved.height, zoomed.height);
  const resized = Crop.drag(moved, { x: 0, y: 0 }, { x: .1, y: .1 }, 'se');
  assert(Crop.valid(resized));assert(resized.width > moved.width);
});

test('zoom uses the existing saved crop format and ignores invalid zoom factors', () => {
  const original = { x: 0, y: 0, width: 1, height: 1 };
  for (const factor of [0, -1, NaN, Infinity]) assert.deepEqual(Crop.zoom(original, factor), original);
  const project = Model.newProject('zoom-save');
  project.operatives.push({ ...Model.blank('operative', 'operative'), name: 'Gunner', image: 'data:image/png;base64,AAAA', imageWidth: 1200, imageHeight: 800, imageCrop: Crop.zoom(original, 3), stats: { APL: 2, MOVE: '6″', SAVE: '4+', WOUNDS: 8 }, keywords: [], loadouts: [] });
  const saved = JSON.parse(JSON.stringify(project));
  assert.deepEqual(Model.validate(Model.migrate(saved)).operatives[0].imageCrop, project.operatives[0].imageCrop);
  assert.equal(saved.operatives[0].image, project.operatives[0].image);
});
