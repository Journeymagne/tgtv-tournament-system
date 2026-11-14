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
const { hash, csrfToken } = require('../../src/telegram/security');
const { handleUpdate } = require('../../src/telegram/bot');
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
  await pool.query('TRUNCATE accounts.telegram_miniapp_link_flows, accounts.telegram_miniapp_link_budgets');
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
async function request(path, body, accessToken, headerOverrides = {}) {
  // Deliberately never send or persist cookies: this is the Telegram WebView contract.
  const response = await fetch(server.baseUrl + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: server.baseUrl, 'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...headerOverrides },
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

async function prepared(initData = launch(), name = account.name) {
  const initial = await bootstrap(initData);
  const credentials = await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name, password });
  assert.equal(credentials.status, 200, JSON.stringify(credentials.body));
  return { challenge: initial.body.link.challenge, proof: credentials.body.proof, initData, locale: 'en' };
}

test('verified email can authorize linking while pending or unknown email stays generic', async () => {
  await pool.query("INSERT INTO user_email_accounts(user_id,email,verified_at,pending_email) VALUES($1,'verified@example.com',NOW(),'pending@example.com')", [account.id]);
  await prepared(launch(), ' VERIFIED@EXAMPLE.COM ');
  for (const name of ['pending@example.com', 'missing@example.com']) {
    const initial = await bootstrap(launch());
    const result = await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name, password });
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'Invalid name or password');
  }
  await assertNoWebsiteSessionOrLink();
});

test('proof is bound to the exact verified launch, single-use and cannot be rebound', async () => {
  const flow = await prepared();
  const changed = new URLSearchParams(flow.initData);
  changed.set('query_id', 'different-signed-launch');
  changed.delete('hash');
  const key = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  changed.set('hash', crypto.createHmac('sha256', key).update([...changed.keys()].sort().map(k => `${k}=${changed.get(k)}`).join('\n')).digest('hex'));
  assert.equal((await request('/api/miniapp/link/confirm', { ...flow, initData: changed.toString() })).status, 401);
  assert.equal((await request('/api/miniapp/link/confirm', { ...flow, proof: crypto.randomBytes(32).toString('base64url') })).status, 401);
  assert.equal((await request('/api/auth/telegram-link', { challenge: flow.challenge, name: account.name, password })).status, 401);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 200);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  const recovered = await request('/api/miniapp/session', { initData: flow.initData });
  assert.equal(recovered.body.authenticated, true);
  assert.equal(recovered.body.user.id, account.id);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM telegram_outbox WHERE dedup_key LIKE 'linked:%'")).rows[0].n, 1);
});

test('cancellation is idempotent and cannot cancel another Telegram flow', async () => {
  const flow = await prepared();
  telegramId++;
  const otherLaunch = launch();
  assert.equal((await request('/api/miniapp/link/cancel', { challenge: flow.challenge, initData: otherLaunch })).status, 401);
  assert.equal((await request('/api/miniapp/link/cancel', flow)).status, 200);
  assert.deepEqual((await request('/api/miniapp/link/cancel', flow)).body, { ok: true });
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  await assertNoWebsiteSessionOrLink();
});

test('expired flows cannot authorize or confirm and matching cancellation still succeeds', async () => {
  const flow = await prepared();
  await pool.query("UPDATE accounts.telegram_miniapp_link_flows SET expires_at=NOW()-INTERVAL '1 second'");
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  assert.equal((await request('/api/auth/telegram-link', { challenge: flow.challenge, name: account.name, password })).status, 401);
  assert.deepEqual((await request('/api/miniapp/link/cancel', flow)).body, { ok: true });
  await assertNoWebsiteSessionOrLink();
});

test('linking endpoints reject foreign or missing origins and non-JSON bodies', async () => {
  const flow = await prepared();
  for (const path of ['/api/auth/telegram-link', '/api/miniapp/link/confirm', '/api/miniapp/link/cancel']) {
    assert.equal((await request(path, { ...flow, name: account.name, password }, null, { Origin: 'https://foreign.example' })).status, 403);
    const missing = await fetch(server.baseUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flow) });
    assert.equal(missing.status, 403);
    await missing.arrayBuffer();
    assert.equal((await request(path, flow, null, { 'Content-Type': 'text/plain' })).status, 415);
  }
  await assertNoWebsiteSessionOrLink();
});

test('password changes revoke pending proofs, and suspended users cannot authorize or confirm', async () => {
  const flow = await prepared();
  await users.setPasswordHash(pool, account.id, await hashPassword('new-test-password'));
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  await users.setPasswordHash(pool, account.id, await hashPassword(password));
  const next = await prepared();
  await pool.query("UPDATE users SET suspended_until=NOW()+INTERVAL '1 hour' WHERE id=$1", [account.id]);
  assert.equal((await request('/api/miniapp/link/confirm', next)).status, 403);
  const initial = await bootstrap(launch());
  assert.equal((await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name: account.name, password })).status, 403);
  await assertNoWebsiteSessionOrLink();
});

test('linked session bootstrap retains existing behavior beyond challenge admission limits', async () => {
  const flow = await prepared();
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 200);
  for (let i = 0; i < 12; i++) {
    const result = await request('/api/miniapp/session', { initData: flow.initData });
    assert.equal(result.status, 200);
    assert.equal(result.body.authenticated, true);
  }
  const budget = await pool.query("SELECT hits FROM accounts.telegram_miniapp_link_budgets WHERE kind='telegram' AND key_hash=$1", [hash(String(telegramId))]);
  assert.equal(budget.rows[0].hits, 1);
});

test('challenge admission caps live flows, persists Telegram budget and stores only hashes', async () => {
  const initData = launch();
  const flows = [];
  for (let i = 0; i < 3; i++) flows.push((await bootstrap(initData)).body.link);
  assert.equal((await request('/api/miniapp/session', { initData })).status, 429);
  for (const flow of flows) assert.equal((await request('/api/miniapp/link/cancel', { challenge: flow.challenge, initData })).status, 200);
  for (let i = 0; i < 6; i++) {
    const flow = (await bootstrap(initData)).body.link;
    assert.equal((await request('/api/miniapp/link/cancel', { challenge: flow.challenge, initData })).status, 200);
  }
  assert.equal((await request('/api/miniapp/session', { initData })).status, 429);
  const stored = JSON.stringify((await pool.query('SELECT * FROM accounts.telegram_miniapp_link_flows')).rows);
  assert.ok(!stored.includes(initData));
  for (const flow of flows) assert.ok(!stored.includes(flow.challenge));
});

test('failed-password budgets survive rollback and fresh challenges cannot reset the identifier budget', async () => {
  const initial = await bootstrap(launch());
  const challenge = initial.body.link.challenge;
  for (let i = 0; i < 5; i++) assert.equal((await request('/api/auth/telegram-link', { challenge, name: account.name, password: 'wrong' })).status, 401);
  assert.equal((await request('/api/auth/telegram-link', { challenge, name: account.name, password })).status, 429);
  for (let i = 0; i < 4; i++) {
    telegramId++;
    const fresh = (await bootstrap(launch())).body.link.challenge;
    assert.equal((await request('/api/auth/telegram-link', { challenge: fresh, name: '  MINIAPPLINKPLAYER  ', password: 'wrong' })).status, 401);
  }
  telegramId++;
  const fresh = (await bootstrap(launch())).body.link.challenge;
  assert.equal((await request('/api/auth/telegram-link', { challenge: fresh, name: account.name, password })).status, 429);
  assert.equal((await pool.query("SELECT hits FROM accounts.telegram_miniapp_link_budgets WHERE kind='identifier' AND key_hash=$1", [hash(account.name.toLowerCase())])).rows[0].hits, 11);
  await assertNoWebsiteSessionOrLink();
});

test('admin-only policy is rechecked at confirmation and does not create an ordinary website session', async () => {
  const flow = await prepared();
  process.env.TELEGRAM_ADMIN_ONLY = 'true';
  try {
    assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 403);
    await assertNoWebsiteSessionOrLink();
    await pool.query('UPDATE users SET is_admin=TRUE WHERE id=$1', [account.id]);
    assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 200);
  } finally { process.env.TELEGRAM_ADMIN_ONLY = 'false'; }
});

test('competing accounts confirming the same Telegram produce one link and one welcome without deadlock', async () => {
  const first = await prepared();
  const other = await users.insert(pool, { name: 'OtherLinkPlayer', passwordHash: await hashPassword(password), rating: 1000, isAdmin: false });
  const second = await prepared(first.initData, other.name);
  const results = await Promise.all([request('/api/miniapp/link/confirm', first), request('/api/miniapp/link/confirm', second)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 1);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM telegram_outbox WHERE dedup_key LIKE 'linked:%'")).rows[0].n, 1);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM accounts.telegram_miniapp_link_flows WHERE revoked_at IS NULL')).rows[0].n, 0);
});

test('competing Telegram identities cannot both link the same website account', async () => {
  const first = await prepared();
  telegramId++;
  const second = await prepared();
  const results = await Promise.all([request('/api/miniapp/link/confirm', first), request('/api/miniapp/link/confirm', second)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 1);
});

async function websiteSession() {
  const response = await request('/api/login', { name: account.name, password });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { Cookie: cookie, 'X-CSRF-Token': csrfToken({ headers: { cookie } }), 'X-Telegram-Account': String(account.id) };
}
test('website unlink revokes pending proofs even before linking, and existing bearer becomes unusable', async () => {
  const flow = await prepared();
  const headers = await websiteSession();
  const unlinked = await fetch(server.baseUrl + '/api/telegram/link', { method: 'DELETE', headers: { Origin: server.baseUrl, 'Content-Type': 'application/json', ...headers }, body: '{}' });
  assert.equal(unlinked.status, 200);
  await unlinked.arrayBuffer();
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  const next = await prepared();
  const result = await request('/api/miniapp/link/confirm', next);
  assert.equal(result.status, 200);
  const response = await fetch(server.baseUrl + '/api/telegram/link', { method: 'DELETE', headers: { Origin: server.baseUrl, 'Content-Type': 'application/json', ...headers }, body: '{}' });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  assert.equal((await request('/api/miniapp/summary', undefined, result.body.accessToken)).status, 401);
  assert.equal((await request('/api/miniapp/link/confirm', next)).status, 401);
});

test('bot unlink and ordinary website linking invalidate older proofs and website tokens', async () => {
  const flow = await prepared();
  await pool.query("INSERT INTO telegram_link_tokens(user_id,token_hash,telegram_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')", [account.id, hash('old-website-token'), telegramId]);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 200);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_link_tokens')).rows[0].n, 0);
  await withTransaction(client => handleUpdate(client, { update_id: telegramId, callback_query: {
    id: 'unlink-test', from: { id: telegramId }, data: 'unlink:yes', message: { chat: { id: telegramId, type: 'private' } }
  } }));
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 0);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  const pending = await prepared();
  await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,$2,$2)', [account.id, telegramId]);
  assert.equal((await request('/api/miniapp/link/confirm', pending)).status, 401);
});

test('password update waits for account lock and cannot leave an old pending proof usable', async () => {
  const flow = await prepared();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [account.id]);
    const confirming = request('/api/miniapp/link/confirm', flow);
    await users.setPasswordHash(client, account.id, await hashPassword('changed-during-confirm'));
    await client.query('COMMIT');
    assert.equal((await confirming).status, 401);
  } finally { await client.query('ROLLBACK'); client.release(); }
  await assertNoWebsiteSessionOrLink();
});

test('account deletion removes prepared authorization and a different Telegram cannot consume it', async () => {
  const flow = await prepared();
  telegramId++;
  assert.equal((await request('/api/miniapp/link/confirm', { ...flow, initData: launch() })).status, 401);
  await pool.query('DELETE FROM users WHERE id=$1', [account.id]);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM accounts.telegram_miniapp_link_flows')).rows[0].n, 0);
});

test('linked-to-unlinked bootstrap race cannot create a challenge without admission', async () => {
  const initData = launch();
  await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,$2,$2)', [account.id, telegramId]);
  const racedRoutes = routes.map(route => route.path === '/api/miniapp/session' ? {
    ...route, miniappLinkPreflight: async (client, req, body) => {
      await route.miniappLinkPreflight(client, req, body);
      // Deterministic unlink between the autocommit preflight and route transaction.
      await pool.query('DELETE FROM telegram_links WHERE user_id=$1', [account.id]);
    }
  } : route);
  const raced = await startApiServer(createRouter(racedRoutes, { withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter: limiter }));
  try {
    const response = await fetch(raced.baseUrl + '/api/miniapp/session', { method: 'POST',
      headers: { Origin: server.baseUrl, 'Content-Type': 'application/json' }, body: JSON.stringify({ initData }) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'Telegram linking expired. Sign in again.');
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM accounts.telegram_miniapp_link_flows')).rows[0].n, 0);
  } finally { await raced.close(); }
});

test('tampered and expired Telegram launches cannot create, consume or cancel authorization', async () => {
  const flow = await prepared();
  const tampered = new URLSearchParams(flow.initData);
  tampered.set('user', JSON.stringify({ id: telegramId + 999 }));
  const expired = new URLSearchParams(flow.initData);
  expired.delete('hash');
  expired.set('auth_date', String(Math.floor(Date.now() / 1000) - 3601));
  const key = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  expired.set('hash', crypto.createHmac('sha256', key).update([...expired.keys()].sort().map(k => `${k}=${expired.get(k)}`).join('\n')).digest('hex'));
  for (const initData of [tampered.toString(), expired.toString()]) {
    for (const endpoint of ['/api/miniapp/session', '/api/miniapp/link/confirm', '/api/miniapp/link/cancel']) {
      assert.equal((await request(endpoint, { ...flow, initData })).status, 401);
    }
  }
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 200);
});

test('an already linked website account cannot be implicitly replaced', async () => {
  const flow = await prepared();
  await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,$2,$2)', [account.id, telegramId + 100]);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
  const initial = await bootstrap(flow.initData);
  const result = await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name: account.name, password });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'This account is already linked.');
  const link = (await pool.query('SELECT telegram_id FROM telegram_links WHERE user_id=$1', [account.id])).rows[0];
  assert.equal(String(link.telegram_id), String(telegramId + 100));
});

test('IP admission persists through failed proof transactions and invalid requests do not spend it', async () => {
  const flow = await prepared();
  const ip = (await pool.query("SELECT key_hash FROM accounts.telegram_miniapp_link_budgets WHERE kind='ip'")).rows[0].key_hash;
  await pool.query("UPDATE accounts.telegram_miniapp_link_budgets SET hits=89 WHERE kind='ip' AND key_hash=$1", [ip]);
  assert.equal((await request('/api/miniapp/link/confirm', { ...flow, proof: crypto.randomBytes(32).toString('base64url') }, null, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await pool.query("SELECT hits FROM accounts.telegram_miniapp_link_budgets WHERE kind='ip' AND key_hash=$1", [ip])).rows[0].hits, 89);
  assert.equal((await request('/api/miniapp/link/confirm', { ...flow, proof: crypto.randomBytes(32).toString('base64url') })).status, 401);
  const limited = await request('/api/miniapp/link/confirm', flow);
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, 'Too many linking attempts. Try again later.');
  assert.equal((await pool.query("SELECT hits FROM accounts.telegram_miniapp_link_budgets WHERE kind='ip' AND key_hash=$1", [ip])).rows[0].hits, 91);
  await assertNoWebsiteSessionOrLink();
});

test('administrator password reset and authenticated password change revoke pending authorizations', async () => {
  const first = await prepared();
  const administrator = await users.insert(pool, { name: 'LinkResetAdmin', passwordHash: await hashPassword(password), rating: 1000, isAdmin: true });
  const adminLogin = await request('/api/login', { name: administrator.name, password });
  assert.equal(adminLogin.status, 200);
  const reset = await request(`/api/admin/users/${account.id}/reset-password`, {}, null, { Cookie: adminLogin.headers.get('set-cookie').split(';')[0] });
  assert.equal(reset.status, 200);
  assert.equal((await request('/api/miniapp/link/confirm', first)).status, 401);
  await users.setPasswordHash(pool, account.id, await hashPassword(password));
  const next = await prepared();
  const headers = await websiteSession();
  const response = await fetch(server.baseUrl + '/api/me', { method: 'PATCH',
    headers: { Origin: server.baseUrl, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ currentPassword: password, newPassword: 'Changed-through-profile-123' }) });
  assert.equal(response.status, 200);
  await response.arrayBuffer();
  assert.equal((await request('/api/miniapp/link/confirm', next)).status, 401);
});

test('concurrent website unlink and confirm cannot silently restore a successfully removed link', async () => {
  const flow = await prepared();
  const headers = await websiteSession();
  const [confirmation, removal] = await Promise.all([
    request('/api/miniapp/link/confirm', flow),
    fetch(server.baseUrl + '/api/telegram/link', { method: 'DELETE',
      headers: { Origin: server.baseUrl, 'Content-Type': 'application/json', ...headers }, body: '{}' })
  ]);
  assert.ok([200, 401].includes(confirmation.status));
  assert.ok([200, 409].includes(removal.status));
  await removal.arrayBuffer();
  if (removal.status === 200) assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 0);
  assert.equal((await request('/api/miniapp/link/confirm', flow)).status, 401);
});

test('invalid JSON shapes and overlong credential fields are rejected before spending budgets', async () => {
  const initial = await bootstrap(launch());
  const before = (await pool.query('SELECT sum(hits)::int AS n FROM accounts.telegram_miniapp_link_budgets')).rows[0].n;
  assert.equal((await request('/api/auth/telegram-link', [])).status, 400);
  assert.equal((await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name: 'a'.repeat(255), password })).status, 400);
  assert.equal((await request('/api/auth/telegram-link', { challenge: initial.body.link.challenge, name: account.name, password: 'a'.repeat(257) })).status, 400);
  assert.equal((await pool.query('SELECT sum(hits)::int AS n FROM accounts.telegram_miniapp_link_budgets')).rows[0].n, before);
});

test('authorization persists only hashed secrets and admission cleans expired flow/budget rows', async () => {
  const flow = await prepared();
  const rows = (await pool.query('SELECT * FROM accounts.telegram_miniapp_link_flows')).rows;
  const stored = JSON.stringify(rows);
  for (const secret of [flow.challenge, flow.proof, flow.initData, password]) assert.ok(!stored.includes(secret));
  assert.match(rows[0].challenge_hash, /^[a-f0-9]{64}$/);
  assert.match(rows[0].proof_hash, /^[a-f0-9]{64}$/);
  await pool.query("UPDATE accounts.telegram_miniapp_link_flows SET expires_at=NOW()-INTERVAL '1 second'");
  await pool.query("UPDATE accounts.telegram_miniapp_link_budgets SET expires_at=NOW()-INTERVAL '1 second'");
  await bootstrap(launch());
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM accounts.telegram_miniapp_link_flows')).rows[0].n, 1);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM accounts.telegram_miniapp_link_budgets WHERE expires_at<=NOW()')).rows[0].n, 0);
});
