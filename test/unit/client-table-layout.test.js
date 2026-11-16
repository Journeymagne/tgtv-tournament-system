const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../public/table-layout.js'), 'utf8');

// Model actual scroll-container geometry, including the fixed navigation and
// nested columns. The browser inspection covers real CSS and container queries.
function mount({ screen = 2560, minimum = 1500, fraction = 1, fixed = false } = {}) {
  let pending, mutation, resizing, width;
  const events = {};
  const layout = {
    style: { removeProperty() { width = undefined; }, setProperty(name, value) { width = value; } },
    getBoundingClientRect() { return { width: Math.min(width === '100vw' ? screen : parseFloat(width) || 1280, screen - 36) }; },
    querySelectorAll() { return [table]; }, matches(selector) { return selector === '.layout'; }
  };
  const wrapper = { get clientWidth() { return Math.floor(((fixed ? 1280 : layout.getBoundingClientRect().width) - 242) * fraction); } };
  const table = {
    hidden: false, minimum,
    closest(selector) { return selector === '.table-wrap, [data-table-viewport]' ? wrapper : null; },
    getClientRects() { return this.hidden ? [] : [{}]; },
    getBoundingClientRect() { return { width: Math.max(this.minimum, wrapper.clientWidth) }; },
    get scrollWidth() { return Math.ceil(this.getBoundingClientRect().width); }
  };
  const app = { querySelector() { return layout; } };
  vm.runInNewContext(source, {
    document: { querySelector: () => app },
    window: { addEventListener(name, callback) { events[name] = callback; } },
    getComputedStyle: () => ({ display: 'table' }),
    requestAnimationFrame(callback) { pending = callback; return 1; },
    ResizeObserver: class { constructor(callback) { resizing = callback; } observe() {} unobserve() {} },
    MutationObserver: class { constructor(callback) { mutation = callback; } observe() {} }
  });
  function flush() { const callback = pending; pending = undefined; callback?.(); }
  flush();
  return { layout, table, wrapper, flush, events,
    width: () => width,
    mutate() { mutation([{ type: 'childList' }]); flush(); },
    resize(next) { screen = next; resizing(); flush(); },
    ownStyleMutation() { mutation([{ type: 'attributes', attributeName: 'style', target: layout }]); return Boolean(pending); }
  };
}

test('ordinary pages keep their width when the table already fits', () => {
  const page = mount({ minimum: 900 });
  assert.equal(page.layout.getBoundingClientRect().width, 1280);
  assert.equal(page.width(), undefined);
});

test('wide tables receive only the necessary space without a one-pixel scrollbar', () => {
  const page = mount();
  assert.equal(page.wrapper.clientWidth, 1500);
  assert.equal(page.layout.getBoundingClientRect().width, 1742);
  page.resize(2560);
  assert.equal(page.layout.getBoundingClientRect().width, 1742, 'a second measurement must not collapse the expanded layout');
  assert.equal(page.ownStyleMutation(), false, 'own measurements must not schedule a mutation loop');
});

test('tables in nested columns expand the surrounding layout sufficiently', () => {
  const page = mount({ minimum: 720, fraction: 0.5 });
  assert.equal(page.wrapper.clientWidth, 720);
  assert.equal(page.layout.getBoundingClientRect().width, 1682);
});

test('column changes, hiding a table and opening it again recalculate from the ordinary width', () => {
  const page = mount();
  page.table.minimum = 1700; page.mutate();
  assert.equal(page.wrapper.clientWidth, 1700);
  page.table.hidden = true; page.mutate();
  assert.equal(page.width(), undefined);
  page.table.hidden = false; page.mutate();
  assert.equal(page.wrapper.clientWidth, 1700);
  page.table.minimum = 800; page.mutate();
  assert.equal(page.width(), undefined);
});

test('the viewport bounds expansion and resizing restores the appropriate width', () => {
  const page = mount({ screen: 1600, minimum: 1500 });
  assert.equal(page.layout.getBoundingClientRect().width, 1564);
  page.resize(1100);
  assert.equal(page.layout.getBoundingClientRect().width, 1064);
  page.resize(2560);
  assert.equal(page.wrapper.clientWidth, 1500);
});

test('a fixed-width widget does not unnecessarily expand the whole page', () => {
  const page = mount({ fixed: true });
  assert.equal(page.width(), undefined);
});
