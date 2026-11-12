const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.listeners = new Map();
    this.attributes = {}; this.className = ''; this.hidden = false; this._text = '';
    this.style = { setProperty() {} };
    this.classList = { add: value => { this.className += ' ' + value; }, toggle() {} };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children.reverse()) { child.parentElement = this; this.children.unshift(child); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) || []; handlers.push(handler); this.listeners.set(name, handlers);
  }
  dispatchEvent(event) { for (const handler of this.listeners.get(event.type) || []) handler(event); }
  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector === '[data-companion-nav]') return this.dataset.companionNav !== undefined;
    return this.tagName === selector;
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  focus() {}
}

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const flush = () => new Promise(resolve => setImmediate(resolve));
const account = id => ({ id, name: 'Account ' + id });
const inbox = excerpt => ({ generatedAt: '2026-11-13T10:00:00Z', unreadCount: 1,
  items: [{ id: 'faq_reply:private', type: 'faq_reply', title: 'Private reply', excerpt, unread: true, createdAt: '2026-11-13T09:00:00Z' }] });

async function boot(initialUser) {
  const document = new Element('document');
  document.documentElement = new Element('html'); document.body = new Element('body'); document.head = new Element('head');
  document.body.dataset.companionSection = 'initiative';
  const mount = new Element(); mount.dataset.companionNav = ''; document.body.append(mount);
  document.append(document.documentElement, document.head, document.body);
  document.createElement = tag => new Element(tag); document.createTextNode = text => { const node = new Element(); node.textContent = text; return node; };
  const events = new Element('window'), requests = [], sessionReplies = [initialUser], intervals = [];
  const location = new URL('https://companion.test/initiative'); location.reload = () => { throw Error('calculator must not reload on a session change'); };
  const root = { document, location, URL, URLSearchParams, console,
    localStorage: { setItem() {} }, ResizeObserver: class { observe() {} },
    CustomEvent: class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events),
    setInterval: fn => { intervals.push(fn); return intervals.length; }, clearInterval() {},
    fetch: async url => {
      if (url === '/api/session') return { ok: true, json: async () => ({ user: sessionReplies.shift() }) };
      const reply = deferred(); requests.push({ url, reply }); return reply.promise;
    }
  };
  root.window = root;
  const context = vm.createContext(root);
  for (const file of ['companion-shell.js', 'companion-notifications.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8'), context, { filename: file });
  }
  await flush();
  const panel = document.querySelector('.shared-notifications');
  return {
    root, panel, requests, intervals,
    async respond(index, body, status = 200) { requests[index].reply.resolve({ ok: status === 200, status, json: async () => body }); await flush(); },
    async crossTab(user) { sessionReplies.push(user); events.dispatchEvent({ type: 'storage', key: 'kt-companion-session-change' }); await flush(); },
    async focus() { events.dispatchEvent({ type: 'focus' }); await flush(); }
  };
}

test('calculator cross-tab logout immediately removes private notification excerpts', async () => {
  const app = await boot(account(1));
  await app.respond(0, inbox('PRIVATE ALPHA EXCERPT'));
  assert.match(app.panel.textContent, /PRIVATE ALPHA EXCERPT/);
  app.panel.open = true;
  await app.crossTab(null);
  assert.equal(app.panel.hidden, true);
  assert.equal(app.panel.open, false);
  assert.doesNotMatch(app.panel.textContent, /PRIVATE ALPHA EXCERPT/);
});

test('an inbox reply already in flight cannot restore content after logout', async () => {
  const app = await boot(account(1));
  await app.crossTab(null);
  await app.respond(0, inbox('DELAYED ALPHA EXCERPT'));
  assert.equal(app.panel.hidden, true);
  assert.doesNotMatch(app.panel.textContent, /DELAYED ALPHA EXCERPT/);
});

test('guest-to-login initializes the shared inbox without reloading the calculator', async () => {
  const app = await boot(null);
  assert.equal(app.panel.hidden, true);
  assert.equal(app.requests.length, 0);
  await app.crossTab(account(2));
  assert.equal(app.panel.hidden, false);
  assert.equal(app.requests.length, 1);
  await app.respond(0, inbox('BRAVO EXCERPT'));
  assert.match(app.panel.textContent, /BRAVO EXCERPT/);
});

test('account switch starts a new inbox request while the old account request is pending', async () => {
  const app = await boot(account(1));
  await app.crossTab(account(2));
  assert.equal(app.requests.length, 2, 'old busy requests must not prevent loading the new account');
  await app.respond(1, inbox('BRAVO CURRENT EXCERPT'));
  await app.respond(0, inbox('ALPHA STALE EXCERPT'));
  assert.match(app.panel.textContent, /BRAVO CURRENT EXCERPT/);
  assert.doesNotMatch(app.panel.textContent, /ALPHA STALE EXCERPT/);
});

test('an unauthorized inbox refresh clears previously rendered private content', async () => {
  const app = await boot(account(1));
  await app.respond(0, inbox('PRIVATE EXCERPT BEFORE EXPIRY'));
  app.intervals[0](); await flush();
  await app.respond(1, { error: 'Unauthorized' }, 401);
  assert.equal(app.panel.hidden, true);
  assert.doesNotMatch(app.panel.textContent, /PRIVATE EXCERPT BEFORE EXPIRY/);
});
