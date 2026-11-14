const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { TEST_DATABASE_URL } = require('../helpers/db');

// This token signs synthetic Telegram launches only; no external requests occur.
Object.assign(process.env, {
  DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test', EMAIL_PROVIDER: 'disabled',
  TELEGRAM_MODE: 'polling', TELEGRAM_ADMIN_ONLY: 'false', TELEGRAM_WORKER_ENABLED: 'false',
  TELEGRAM_BOT_USERNAME: 'MiniappLinkTestBot', TELEGRAM_BOT_TOKEN: '123456:' + 'b'.repeat(32),
  TELEGRAM_SITE_URL: '', TELEGRAM_MINI_APP_URL: '', TELEGRAM_TUNNEL_PORT: ''
});
const { getPool, closePool, withClient, withTransaction } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { createRouter } = require('../../src/http/router');
const { createRateLimiter } = require('../../src/http/rate-limit');
const { loadUserFromRequest } = require('../../src/api/auth');
const users = require('../../src/db/repositories/users');
const { hashPassword } = require('../../src/domain/passwords');
const { startApiServer } = require('../helpers/client');
const routes = require('../../src/api/routes');
const limiter = createRateLimiter({ max: 1000, windowMs: 60000 });
let pool, server, account, telegramId = 810000;
const password = 'Miniapp-test-password-123';

test.before(async () => {
  pool = getPool();
  await require('../helpers/schema').resetSchemas(pool);
  await migrate(pool);
  server = await startApiServer(createRouter(routes, {
    withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter: limiter
  }));
  process.env.SITE_URL = server.baseUrl;
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE telegram_updates, telegram_state, telegram_events, telegram_outbox');
  limiter.reset();
  telegramId++;
  account = await users.insert(pool, {
    name: 'MiniappLinkPlayer', passwordHash: await hashPassword(password), rating: 1000, isAdmin: false
  });
});

function launch() {
  const person = { id: telegramId, username: 'miniapp_link_player', first_name: 'Link', last_name: 'Player', language_code: 'en' };
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify(person) });
  const key = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const check = [...data.keys()].sort().map(key => `${key}=${data.get(key)}`).join('\n');
  data.set('hash', crypto.createHmac('sha256', key).update(check).digest('hex'));
  return data.toString();
}
async function request(path, body, accessToken) {
  // Deliberately never send or persist cookies: this is the Telegram WebView contract.
  const response = await fetch(server.baseUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: server.baseUrl, 'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function bootstrap(initData) {
  const response = await request('/api/miniapp/session', { initData });
  assert.equal(response.status, 200);
  assert.equal(response.body.authenticated, false);
  assert.equal(response.body.reason, 'not_linked');
  assert.ok(response.body.link?.challenge, 'unlinked Telegram session must offer a linking challenge');
  return response;
}
async function assertNoWebsiteSessionOrLink() {
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM sessions')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 0);
}

test('unlinked Telegram bootstrap returns a five-minute challenge and verified identity', async () => {
  const started = Date.now();
  const response = await bootstrap(launch());
  assert.equal(response.body.locale, 'en');
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.body.link.challenge, /^[A-Za-z0-9_-]{43,}$/);
  assert.deepEqual(response.body.link.telegram, { id: String(telegramId), username: 'miniapp_link_player', displayName: 'Link Player' });
  const expires = Date.parse(response.body.link.expiresAt);
  assert.ok(expires >= started + 295000 && expires <= Date.now() + 300000);
  await assertNoWebsiteSessionOrLink();
});

test('password verification returns a scoped proof without linking or creating a website session', async () => {
  const initial = await bootstrap(launch());
  const response = await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name: account.name, password });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.account, { id: account.id, name: account.name });
  assert.deepEqual(response.body.telegram, initial.body.link.telegram);
  assert.match(response.body.proof, /^[A-Za-z0-9_-]{43,}$/);
  assert.equal(response.body.expiresAt, initial.body.link.expiresAt, 'password verification must not extend the challenge');
  assert.equal(response.body.accessToken, undefined);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.match(response.headers.get('cache-control'), /private.*no-store/);
  await assertNoWebsiteSessionOrLink();
});

test('explicit confirmation creates the link and returns an immediately usable Mini App bearer', async () => {
  const initData = launch();
  const initial = await bootstrap(initData);
  const credentials = await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name: account.name, password });
  assert.equal(credentials.status, 200);
  await assertNoWebsiteSessionOrLink();
  const confirmed = await request('/api/miniapp/link/confirm', {
    challenge: initial.body.link.challenge, proof: credentials.body.proof, initData, locale: 'en'
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.authenticated, true);
  assert.equal(confirmed.body.user.id, account.id);
  assert.equal(confirmed.body.locale, 'en');
  assert.ok(confirmed.body.accessToken);
  assert.ok(confirmed.body.expiresIn > 0);
  assert.equal(confirmed.headers.get('set-cookie'), null);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM sessions')).rows[0].n, 0);
  const links = (await pool.query('SELECT user_id,telegram_id FROM telegram_links')).rows;
  assert.deepEqual(links.map(row => ({ userId: row.user_id, telegramId: String(row.telegram_id) })), [{ userId: account.id, telegramId: String(telegramId) }]);
  const summary = await request('/api/miniapp/summary', undefined, confirmed.body.accessToken);
  assert.equal(summary.status, 200);
  assert.equal(summary.body.user.id, account.id);
});

test('incorrect linking credentials return the ordinary generic 401 without any authorization', async () => {
  const initial = await bootstrap(launch());
  const response = await request('/api/auth/telegram-link', {
    challenge: initial.body.link.challenge, name: account.name, password: 'incorrect-test-password'
  });
  assert.equal(response.status, 401);
  assert.equal(response.body.error, 'Invalid name or password');
  assert.equal(response.body.proof, undefined);
  assert.equal(response.body.account, undefined);
  assert.equal(response.headers.get('set-cookie'), null);
  await assertNoWebsiteSessionOrLink();
});
