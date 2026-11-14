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
