const test = require('node:test');
const assert = require('node:assert/strict');

test('a drop uses the dragged card, destination and insertion point, and consumes the drag once', async () => {
  const { bindTierlistDrag } = await import('../../public/tierlist/drag.js');
  const handlers = {}, moves = [];
  const classList = { add() {}, remove() {} };
  const zone = { dataset: { zone: 'S' }, classList };
  const source = { dataset: { id: 'angels' }, isConnected: true, draggable: true, classList };
  source.closest = selector => selector === '.tl-card' ? source : null;
  const before = { dataset: { id: 'kasrkin' } };
  const target = { closest: selector => selector === '[data-zone]' ? zone : before };
  const workspace = {
    ownerDocument: { body: { classList }, defaultView: { addEventListener() {}, cancelAnimationFrame() {} } },
    contains: element => element === zone,
    addEventListener: (type, handler) => { handlers[type] = handler; }
  };
  bindTierlistDrag(workspace, (...args) => moves.push(args));
  const drop = { target, preventDefault() {} }, start = { target: source, dataTransfer: { setData() {} } };
  handlers.drop(drop);
  assert.deepEqual(moves, []);
  handlers.dragstart(start);
  handlers.drop(drop);
  handlers.drop(drop);
  handlers.dragstart(start);
  handlers.dragend();
  handlers.drop(drop);
  assert.deepEqual(moves, [['angels', 'S', 'kasrkin']]);
});

test('JPEG includes the entire ranked board in order and identifies missing miniatures', async () => {
  const { createTierlistJpeg } = await import('../../public/tierlist/jpeg.js');
  const text = [], drawn = [];
  const ctx = {
    measureText: value => ({ width: value.length * 7 }),
    fillText: value => text.push(value), drawImage: (image, x, y) => drawn.push([image.name, x, y]),
    scale() {}, fillRect() {}
  };
  const canvas = { getContext: () => ctx, toBlob: (done, mime) => done(new Blob([], { type: mime })) };
  const cards = Array.from({ length: 15 }, (_, i) => {
    const name = 'Team ' + (i + 1);
    const image = { name, naturalWidth: 100, naturalHeight: 100, async decode() {} };
    return { title: name, querySelector: () => image };
  });
  const missing = { title: 'Kasrkin', querySelector: () => null };
  const ranks = ['S', 'A', 'B', 'C', 'F'];
  const rows = ranks.map(rank => ({
    querySelector: () => ({ textContent: rank }),
    querySelectorAll: () => rank === 'S' ? cards : rank === 'F' ? [missing] : []
  }));
  const board = {
    ownerDocument: { createElement: () => canvas, defaultView: {
      getComputedStyle: () => ({ fontFamily: 'sans-serif', getPropertyValue: () => '#222' })
    } },
    querySelectorAll(selector) { assert.equal(selector, '.tl-tier'); return rows; }
  };
  const options = { title: 'League', season: 'Q4 Dataslate', cardSize: 96, showNames: false };
  const blob = await createTierlistJpeg(board, options);
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(canvas.width, 1920);
  assert.deepEqual(text, ['League', 'Q4 Dataslate', ...ranks, 'Kasrkin']);
  assert.deepEqual(drawn.map(([name]) => name), cards.map(card => card.title));
  assert.ok(drawn.at(-1)[2] > drawn[0][2], 'the last miniature fits on a second row');
  const heightWithoutNames = canvas.height;
  text.length = 0;
  await createTierlistJpeg(board, { ...options, showNames: true });
  assert.ok(text.includes('Team 15'));
  assert.ok(canvas.height > heightWithoutNames);
});
