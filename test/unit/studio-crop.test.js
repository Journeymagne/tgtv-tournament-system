const test = require('node:test');
const assert = require('node:assert/strict');
const Crop = require('../../public/studio/operative-crop');
const Model = require('../../public/studio/model');
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('zoom crosses below original size and back without extending the source crop', () => {
  const full = { x: 0, y: 0, width: 1, height: 1 };
  for (const percent of [10, 50, 80, 100, 125, 800]) {
    const crop = Crop.zoomTo(full, percent);
    assert(Crop.valid(crop));
    near(100 * crop.scale / Math.max(crop.width, crop.height), percent);
    near(crop.x + crop.width / 2, .5);near(crop.y + crop.height / 2, .5);
  }
  const small = Crop.zoomTo(Crop.zoomTo(full, 200), 50);
  assert.deepEqual(small, { ...full, scale: .5 });
  assert.deepEqual(Crop.zoomTo(small, 100), { ...full, scale: 1 });
  const edge = Crop.zoomTo({ x: .8, y: .9, width: .2, height: .1 }, 25);
  assert(Crop.valid(edge));near(edge.width / edge.height, 2);near(edge.scale, .25);
});

test('zoom-out scale persists in projects with offsets and rejects invalid scales', () => {
  const project = Model.newProject('zoom-out-save');
  project.operatives.push({ ...Model.blank('operative', 'operative'), name: 'Gunner', image: 'data:image/png;base64,AAAA', imageWidth: 400, imageHeight: 240, imageCrop: { ...Crop.zoomTo({ x: 0, y: 0, width: 1, height: 1 }, 50), offsetY: -.25 }, stats: { APL: 2, MOVE: '6″', SAVE: '4+', WOUNDS: 8 }, keywords: [], loadouts: [] });
  const restored = Model.validate(Model.migrate(JSON.parse(JSON.stringify(project))));
  assert.deepEqual(restored.operatives[0].imageCrop, project.operatives[0].imageCrop);
  for (const value of [.1, .5, 1]) { restored.operatives[0].imageCrop.scale = value; assert.doesNotThrow(() => Model.validate(restored)); }
  for (const value of [0, -.5, .09, 1.01, Infinity, NaN, '.5', null]) {
    restored.operatives[0].imageCrop.scale = value;assert.throws(() => Model.validate(restored), /масштаб/);
  }
  delete restored.operatives[0].imageCrop.scale;assert.doesNotThrow(() => Model.validate(restored));
});

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

test('vertical offset survives saved project validation and rejects invalid values', () => {
  const project = Model.newProject('offset-save');
  project.operatives.push({ ...Model.blank('operative', 'operative'), name: 'Gunner', image: 'data:image/png;base64,AAAA', imageWidth: 400, imageHeight: 240, imageCrop: { x: 0, y: 0, width: 1, height: 1, offsetY: -.4 }, stats: { APL: 2, MOVE: '6″', SAVE: '4+', WOUNDS: 8 }, keywords: [], loadouts: [] });
  const restored = Model.validate(Model.migrate(JSON.parse(JSON.stringify(project))));
  assert.equal(restored.operatives[0].imageCrop.offsetY, -.4);
  for (const value of [-1, 0, 1]) { restored.operatives[0].imageCrop.offsetY = value; assert.doesNotThrow(() => Model.validate(restored)); }
  for (const value of [-1.01, 1.01, Infinity, NaN, '-0.4', null]) {
    restored.operatives[0].imageCrop.offsetY = value;assert.throws(() => Model.validate(restored), /сдвиг/);
  }
  delete restored.operatives[0].imageCrop.offsetY;assert.doesNotThrow(() => Model.validate(restored), 'old saved crops remain valid');
});
