const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const i18n = require('../../public/miniapp/i18n');
const filename = path.join(__dirname, '../../public/miniapp/link-flow.js');
const challenge = 'c'.repeat(43), proof = 'p'.repeat(43), password = 'private-test-password';
const telegram = { id: '123', username: 'verified_person', displayName: '<Verified Telegram>' };
const account = { id: 42, name: '<Verified Companion>' };
const expiresAt = '2026-11-14T12:05:00.000Z';
const unlinked = () => ({ authenticated: false, reason: 'not_linked', locale: 'en', link: { challenge, telegram, expiresAt } });
const prepared = () => ({ account, telegram, proof, expiresAt });
const authenticated = (id = 42) => ({ authenticated: true, user: { id, name: 'Companion' }, accessToken: 'miniapp-token', locale: 'en' });
const response = (body, status = 200, type = 'application/json') => ({ ok: status < 400, status, headers: { get: () => type }, json: async () => body });
function harness(replies = []) {
  // A missing implementation fails the named behavior below, never module loading.
  assert.ok(fs.existsSync(filename), 'A cookie-independent Mini App linking controller must implement this behavior');
  const context = { module: { exports: {} }, AbortSignal, Date, JSON, setTimeout, clearTimeout };
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(context, name, { get() { throw Error('Storage is unavailable'); } });
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  assert.equal(typeof context.module.exports.create, 'function', 'link-flow exports create');
  const calls = [], updates = [], successes = [], timers = [];
  let clears = 0, now = Date.parse('2026-11-14T12:00:00Z');
  const flow = context.module.exports.create({
    initData: 'signed-telegram-launch',
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      assert.ok(replies.length, 'Unexpected linking HTTP request');
      const next = replies.shift();
      if (typeof next === 'function') return next();
      if (next instanceof Error) throw next;
      return next;
    },
    onChange: value => updates.push(JSON.parse(JSON.stringify(value))),
    onAuthenticated: value => successes.push(value),
    clearPassword: () => { clears++; },
    now: () => now,
    setTimer: callback => { timers.push(callback); return timers.length; },
    clearTimer: () => {}
  });
  flow.start(unlinked());
  return { flow, calls, updates, successes, timers, clears: () => clears, advance: ms => { now += ms; } };
}

test('credentials use the accounts endpoint without cookies and require a separate explicit confirmation', async () => {
  const h = harness([response(prepared()), response(authenticated())]);
  await h.flow.submit('player@example.test', password);
  assert.equal(h.calls.length, 1, 'Password submission must not confirm automatically');
  assert.equal(h.calls[0].url, '/api/auth/telegram-link');
  assert.equal(h.calls[0].credentials, 'omit');
  assert.equal(h.calls[0].cache, 'no-store');
  assert.equal(h.calls[0].method, 'POST');
  assert.equal(h.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(h.calls[0].body), { challenge, name: 'player@example.test', password });
  assert.equal(h.flow.snapshot().stage, 'confirm');
  assert.equal(h.flow.snapshot().account.name, account.name);
  assert.equal(h.flow.snapshot().telegram.displayName, telegram.displayName);
  assert.ok(h.clears() >= 1);
  assert.equal(h.successes.length, 0);
  await h.flow.confirm('en');
  assert.equal(h.calls[1].url, '/api/miniapp/link/confirm');
  assert.equal(h.calls[1].credentials, 'omit');
  assert.deepEqual(JSON.parse(h.calls[1].body), { challenge, proof, initData: 'signed-telegram-launch', locale: 'en' });
  assert.equal(h.successes.length, 1);
  assert.equal(h.flow.snapshot().account, null, 'Successful flow drops prepared identity and secrets');
});

test('wrong password stays on credentials, clears the raw input, and never appears in observable state', async () => {
  const h = harness([response({ error: 'Invalid name or password' }, 401)]);
  await h.flow.submit('player', password);
  assert.equal(h.flow.snapshot().stage, 'credentials');
  assert.equal(h.flow.snapshot().error, 'Invalid name or password');
  assert.ok(h.clears() >= 1);
  assert.doesNotMatch(JSON.stringify(h.updates), /private-test-password|"proof"|"challenge"/);
  assert.equal(h.successes.length, 0);
});

test('cancel clears prepared state, omits cookies, and bootstraps a fresh challenge', async () => {
  const fresh = unlinked(); fresh.link.challenge = 'n'.repeat(43);
  const h = harness([response(prepared()), response({ ok: true }), response(fresh), response(prepared())]);
  await h.flow.submit('player', password);
  await h.flow.cancel();
  assert.equal(h.calls[1].url, '/api/miniapp/link/cancel');
  assert.equal(h.calls[1].credentials, 'omit');
  assert.deepEqual(JSON.parse(h.calls[1].body), { challenge, initData: 'signed-telegram-launch' });
  assert.equal(h.calls[2].url, '/api/miniapp/session');
  assert.equal(h.calls[2].credentials, 'omit');
  assert.equal(h.flow.snapshot().stage, 'credentials');
  assert.equal(h.flow.snapshot().account, null);
  await h.flow.submit('other-player', password);
  assert.equal(JSON.parse(h.calls[3].body).challenge, fresh.link.challenge);
});

test('a late password response cannot restore a cancelled confirmation', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const h = harness([() => pending, response({ ok: true }), response(unlinked())]);
  const submission = h.flow.submit('player', password);
  await h.flow.cancel();
  resolve(response(prepared())); await submission;
  assert.equal(h.flow.snapshot().stage, 'credentials');
  assert.equal(h.flow.snapshot().account, null);
  assert.equal(h.successes.length, 0);
});

test('an identity change discards a previous launch response', async () => {
  let resolve;
  const h = harness([() => new Promise(done => { resolve = done; })]);
  const submission = h.flow.submit('player', password);
  const next = unlinked(); next.link.telegram = { ...telegram, id: '999', displayName: 'Other Telegram' };
  h.flow.start(next);
  resolve(response(prepared())); await submission;
  assert.equal(h.flow.snapshot().telegram.id, '999');
  assert.equal(h.flow.snapshot().stage, 'credentials');
  assert.equal(h.flow.snapshot().account, null);
});

test('confirmation in flight cannot be cancelled or submitted twice', async () => {
  let resolve;
  const h = harness([response(prepared()), () => new Promise(done => { resolve = done; })]);
  await h.flow.submit('player', password);
  const pending = h.flow.confirm('ru');
  assert.equal(h.flow.snapshot().stage, 'submitting');
  await h.flow.confirm('ru'); await h.flow.cancel();
  assert.equal(h.calls.length, 2);
  resolve(response(authenticated())); await pending;
  assert.equal(h.successes.length, 1);
});

for (const expected of [true, false]) test(`lost confirmation response ${expected ? 'recovers the expected account' : 'rejects another account'}`, async () => {
  const h = harness([response(prepared()), Error('connection lost'), response(authenticated(expected ? 42 : 99))]);
  await h.flow.submit('player', password); await h.flow.confirm('en');
  assert.equal(h.calls[2].url, '/api/miniapp/session');
  assert.equal(h.calls[2].credentials, 'omit');
  assert.equal(h.successes.length, expected ? 1 : 0);
  assert.equal(h.flow.snapshot().account, null);
  if (!expected) assert.ok(h.flow.snapshot().error, 'A mismatched session must require safe repetition');
});

test('an unresolved confirmation keeps its expected account through mismatched restart sessions', async () => {
  const h = harness([response(prepared()), Error('connection lost'), response(authenticated(99)),
    response(authenticated(99)), response(authenticated(42))]);
  await h.flow.submit('player', password); await h.flow.confirm('en');
  await h.flow.cancel();
  assert.equal(h.successes.length, 0, 'Restart must not silently adopt the rejected account');
  assert.equal(h.flow.snapshot().restartRequired, true);
  assert.ok(h.flow.snapshot().error);
  await h.flow.cancel();
  assert.equal(h.successes.length, 1, 'A later retry can still recover the expected account');
  assert.equal(h.successes[0].user.id, 42);
});

test('a verified unlinked restart permits a different account only after a new explicit confirmation', async () => {
  const other = { ...prepared(), account: { id: 99, name: 'Other Companion' } };
  const h = harness([response(prepared()), Error('connection lost'), response(authenticated(99)),
    response(unlinked()), response(other), response(authenticated(99))]);
  await h.flow.submit('player', password); await h.flow.confirm('en'); await h.flow.cancel();
  assert.equal(h.flow.snapshot().stage, 'credentials');
  await h.flow.submit('other-player', password);
  assert.equal(h.flow.snapshot().stage, 'confirm');
  assert.equal(h.successes.length, 0);
  await h.flow.confirm('en');
  assert.equal(h.successes[0].user.id, 99);
});

// This small DOM host executes the real app and controller. It models event
// delivery and rendered content, without adding a browser dependency to CI.
function appHarness(replies) {
  const calls = [], elements = new Map(), documentEvents = new Map(), windowEvents = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', innerHTML: '', hidden: false, disabled: false, dataset: {},
      setAttribute(name, value) { this[name] = value; }, focus() {}, querySelectorAll: () => [],
      addEventListener(name, handler) { this[name] = handler; } });
    return elements.get(id);
  }
  const document = { documentElement: { dataset: { theme: 'dark' } },
    getElementById(id) {
      if (id.startsWith('link-') && !element('content').innerHTML.includes(`id="${id}"`)) return null;
      return element(id);
    },
    querySelector: () => element('brand-image'), querySelectorAll: () => [],
    addEventListener: (name, handler) => documentEvents.set(name, handler) };
  const location = new URL('https://example.test/miniapp');
  const noop = () => {};
  const window = { document, KTMiniI18n: i18n,
    Telegram: { WebApp: { initData: 'signed-launch', initDataUnsafe: { user: { language_code: 'en' } }, colorScheme: 'dark',
      ready: noop, expand: noop, BackButton: { show: noop, hide: noop, onClick: noop } } },
    addEventListener: (name, handler) => windowEvents.set(name, handler), scrollTo: noop };
  const context = vm.createContext({ window, document, location, navigator: { language: 'en' },
    history: { replaceState: (_state, _title, href) => { location.href = new URL(href, location).href; } },
    URL, URLSearchParams, AbortSignal, setTimeout: () => 1, clearTimeout: noop, setInterval: noop,
    fetch: async (url, options) => {
      calls.push({ url, ...options });
      assert.ok(replies.length, 'Unexpected app HTTP request: ' + url);
      const next = replies.shift();
      if (typeof next === 'function') return next();
      if (next instanceof Error) throw next;
      return next;
    } });
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../public/miniapp/app.js'), 'utf8'), context);
  return { calls, element, documentEvents, windowEvents,
    click: attribute => documentEvents.get('click')({ preventDefault: noop,
      target: { closest() { return this; }, hasAttribute: name => name === attribute } }),
    submit: () => documentEvents.get('submit')({ preventDefault: noop, target: { id: 'link-form' } }) };
}
const settleApp = () => new Promise(resolve => setImmediate(resolve));

test('rendered Sign in again action rejects a different account after uncertain confirmation', async () => {
  const session = unlinked(); session.link.expiresAt = new Date(Date.now() + 300000).toISOString();
  const login = { ...prepared(), expiresAt: session.link.expiresAt };
  const h = appHarness([response(session), response(login), Error('connection lost'), response(authenticated(99)), response(authenticated(99))]);
  await settleApp();
  h.element('link-name').value = 'player'; h.element('link-password').value = password;
  await h.submit(); await h.click('data-link-confirm');
  assert.match(h.element('content').innerHTML, /Sign in again/);
  await h.click('data-link-back');
  assert.match(h.element('content').innerHTML, /Could not verify the connection/);
  assert.ok(h.calls.every(call => call.url !== '/api/miniapp/summary'), 'Wrong account must never enter the authenticated application');
});

test('obsolete bootstrap rejection after BFCache restore cannot replace the new form or unlock its operation', async () => {
  let rejectOld, resolveCredentials;
  const session = unlinked(); session.link.expiresAt = new Date(Date.now() + 300000).toISOString();
  const h = appHarness([() => new Promise((_resolve, reject) => { rejectOld = reject; }), response(session),
    () => new Promise(resolve => { resolveCredentials = resolve; })]);
  h.windowEvents.get('pagehide')({}); h.windowEvents.get('pageshow')({ persisted: true });
  await settleApp();
  assert.match(h.element('content').innerHTML, /id="link-form"/);
  h.element('link-name').value = 'player'; h.element('link-password').value = password;
  const submission = h.submit();
  assert.equal(h.element('refresh-button').disabled, true);
  const currentHTML = h.element('content').innerHTML;
  rejectOld(Error('obsolete bootstrap failed')); await settleApp();
  assert.equal(h.element('content').innerHTML, currentHTML);
  assert.equal(h.element('refresh-button').disabled, true);
  resolveCredentials(response({ ...prepared(), expiresAt: session.link.expiresAt })); await submission;
  assert.match(h.element('content').innerHTML, /data-link-confirm/);
});

test('pagehide alone invalidates an outstanding bootstrap success and its cleanup', async () => {
  let resolveOld;
  const session = unlinked(); session.link.expiresAt = new Date(Date.now() + 300000).toISOString();
  const h = appHarness([() => new Promise(resolve => { resolveOld = resolve; })]);
  const before = h.element('content').innerHTML;
  h.windowEvents.get('pagehide')({}); resolveOld(response(session)); await settleApp();
  assert.equal(h.element('content').innerHTML, before);
  assert.equal(h.element('refresh-button').disabled, true);
});

test('expired confirmation clears proof and prevents submission without extending challenge lifetime', async () => {
  const h = harness([response(prepared())]);
  await h.flow.submit('player', password);
  h.advance(300001);
  await h.flow.confirm('en');
  assert.equal(h.calls.length, 1);
  assert.equal(h.flow.snapshot().account, null);
  assert.equal(h.flow.snapshot().error, 'Telegram linking expired. Sign in again.');
});

test('link requests require JSON responses and keep secrets out of URLs and observable state with storage blocked', async () => {
  const h = harness([response(prepared(), 200, 'text/html')]);
  await h.flow.submit('player', password);
  assert.equal(h.flow.snapshot().stage, 'credentials');
  assert.ok(h.flow.snapshot().error);
  for (const call of h.calls) assert.doesNotMatch(call.url, /[?]|private-test-password|cccccccc|pppppppp/);
  assert.doesNotMatch(JSON.stringify(h.updates), /private-test-password|"proof"|"challenge"/);
  h.flow.dispose();
  assert.equal(h.flow.snapshot().account, null);
});

test('inline linking has approved Russian labels and natural English translations', () => {
  const pairs = {
    'Войти в KT Companion': 'Sign in to KT Companion',
    'Войдите в свой аккаунт, чтобы подключить Telegram': 'Sign in to your account to connect Telegram',
    'Имя или email': 'Name or email', 'Пароль': 'Password', 'Продолжить': 'Continue',
    'Подключить этот Telegram к вашему аккаунту KT Companion?': 'Connect this Telegram to your KT Companion account?',
    'Подключить Telegram': 'Connect Telegram', 'Назад': 'Back',
    'Неверное имя, email или пароль': 'Incorrect name, email or password',
    'Время подтверждения истекло. Войдите ещё раз': 'Confirmation expired. Sign in again',
    'Telegram подключён': 'Telegram connected'
  };
  for (const [ru, en] of Object.entries(pairs)) {
    assert.equal(i18n.text(ru, 'ru'), ru);
    assert.equal(i18n.text(ru, 'en'), en);
  }
});
