const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { TEST_DATABASE_URL } = require('../helpers/db');
Object.assign(process.env, { DATABASE_URL: TEST_DATABASE_URL, NODE_ENV: 'test', HOST: '127.0.0.1',
  EMAIL_PROVIDER: 'disabled', TELEGRAM_MODE: 'local', TELEGRAM_ADMIN_ONLY: 'true',
  TELEGRAM_WORKER_ENABLED: 'true', TELEGRAM_SITE_URL: '',
  TELEGRAM_BOT_USERNAME: 'PreviewTestBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32),
  SITE_URL: 'http://127.0.0.1', TELEGRAM_MINI_APP_URL: '', TELEGRAM_TUNNEL_PORT: '' });
const { getPool, closePool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { server } = require('../../server');
const users = require('../../src/db/repositories/users');
const sessions = require('../../src/db/repositories/sessions');
const games = require('../../src/db/repositories/games');
const { hash, csrfToken } = require('../../src/telegram/security');
const { handleUpdate } = require('../../src/telegram/bot');
const { payloadFor } = require('../../src/telegram/worker');
const { expandEvents } = require('../../src/telegram/data');
const { issueToken } = require('../../src/telegram/miniapp-auth');
let pool, origin, admin, player, owner, updateId = 1;

test.before(async () => {
  pool = getPool();
  await require('../helpers/schema').resetSchemas(pool);
  await migrate(pool);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  process.env.SITE_URL = origin;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); await closePool(); });
async function person(name, isAdmin, telegramId) {
  const user = await users.insert(pool, { name, passwordHash: 'test:hash', rating: 1000, isAdmin });
  const sid = crypto.randomBytes(32).toString('hex');
  await sessions.create(pool, { token: sid, userId: user.id, expiresAt: new Date(Date.now() + 86400000) });
  return { ...user, cookie: `sid=${sid}`, telegramId };
}
function resetTelegramConfiguration() {
  Object.assign(process.env, { TELEGRAM_ADMIN_ONLY: 'true', TELEGRAM_WORKER_ENABLED: 'true',
    TELEGRAM_MODE: 'local', TELEGRAM_SITE_URL: '', TELEGRAM_MINI_APP_URL: '', SITE_URL: origin });
}
function publicApiHost() {
  Object.assign(process.env, { TELEGRAM_ADMIN_ONLY: 'false', TELEGRAM_WORKER_ENABLED: 'false',
    TELEGRAM_MODE: 'polling', TELEGRAM_SITE_URL: 'https://killteamcompanion.com',
    TELEGRAM_MINI_APP_URL: 'https://killteamcompanion.com/miniapp' });
}
test.beforeEach(async () => {
  resetTelegramConfiguration();
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE telegram_updates, telegram_state, telegram_events, telegram_outbox');
  admin = await person('PreviewAdmin', true, 100001);
  player = await person('PreviewPlayer', false, 100002);
  owner = await person('PreviewOwner', false, 100003);
  await pool.query('INSERT INTO platform_ownership(owner_user_id) VALUES($1)', [owner.id]);
});
test.afterEach(resetTelegramConfiguration);
async function request(user, path, method = 'GET', body, token) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (user) Object.assign(headers, { Cookie: user.cookie, 'X-Telegram-Account': String(user.id),
    'X-CSRF-Token': csrfToken({ headers: { cookie: user.cookie } }) });
  const r = await fetch(origin + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}) });
  return { status: r.status, body: await r.json() };
}
async function link(user) {
  const { rows: [row] } = await pool.query('INSERT INTO telegram_links(user_id,telegram_id,chat_id) VALUES($1,$2,$2) RETURNING *', [user.id, user.telegramId]);
  return row;
}
async function update(user, text) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await handleUpdate(client, { update_id: updateId++, message: { text,
      from: { id: user.telegramId, first_name: user.name }, chat: { id: user.telegramId, type: 'private' } } });
    await client.query('COMMIT');
  } catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
function initData(user) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: user.telegramId }) });
  const key = crypto.createHmac('sha256', 'WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', key).update([...p.keys()].sort().map(k => `${k}=${p.get(k)}`).join('\n')).digest('hex'));
  return p.toString();
}

test('website session: administrator and owner enter; player cannot enter or link', async () => {
  for (const user of [admin, owner]) {
    const r = await request(user, '/api/miniapp/session', 'POST');
    assert.equal(r.status, 200); assert.equal(r.body.authenticated, true); assert.equal(r.body.adminOnly, true);
    assert.equal((await request(user, '/api/miniapp/summary')).status, 200);
    assert.equal((await request(user, '/api/telegram/link', 'POST')).status, 200);
  }
  await link(player);
  const status = await request(player, '/api/telegram/status');
  assert.equal(status.body.available, false); assert.equal(status.body.link, null);
  for (const [path, method] of [['/api/miniapp/session','POST'], ['/api/miniapp/summary','GET'],
    ['/api/miniapp/games/1','GET'], ['/api/miniapp/tournaments/test','GET'],
    ['/api/miniapp/games/1/result','POST'], ['/api/miniapp/games/1/confirm-result','POST'],
    ['/api/miniapp/games/1/reject-result','POST'], ['/api/miniapp/preferences','PATCH'],
    ['/api/telegram/link','POST'], ['/api/telegram/confirm','POST'], ['/api/telegram/preferences','PATCH']]) {
    assert.equal((await request(player, path, method)).status, 403, path);
  }
});

test('Telegram initData and existing bearer lose access immediately after role removal', async () => {
  await link(admin); const playerLink = await link(player);
  const r = await request(null, '/api/miniapp/session', 'POST', { initData: initData(admin) });
  assert.equal(r.status, 200); assert.ok(r.body.accessToken);
  const forged = new URLSearchParams(initData(admin));
  forged.set('user', JSON.stringify({ id: owner.telegramId }));
  assert.equal((await request(null, '/api/miniapp/session', 'POST', { initData: forged.toString() })).status, 401);
  assert.equal((await request(null, '/api/miniapp/session', 'POST', { initData: initData(player) })).status, 403);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, issueToken(playerLink, process.env.TELEGRAM_BOT_TOKEN))).status, 403);
  await pool.query('UPDATE users SET is_admin=FALSE WHERE id=$1', [admin.id]);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, r.body.accessToken)).status, 403);
  assert.equal((await request(admin, '/api/miniapp/session', 'POST')).status, 403);
});

test('Mini App follows bot language for cookie and Telegram sessions, including live changes', async () => {
  await link(admin);
  assert.equal((await request(owner, '/api/miniapp/session', 'POST')).body.locale, 'ru');
  async function setBotLanguage(locale) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await handleUpdate(client, { update_id: updateId++, callback_query: {
        id: 'locale-test-' + updateId, from: { id: admin.telegramId, language_code: 'ru' }, data: 'lang:' + locale,
        message: { message_id: 1, chat: { id: admin.telegramId, type: 'private' } }
      } });
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  }
  await setBotLanguage('en');
  const telegram = await request(null, '/api/miniapp/session', 'POST', { initData: initData(admin) });
  assert.equal(telegram.body.locale, 'en');
  assert.equal((await request(admin, '/api/miniapp/session', 'POST')).body.locale, 'en');
  const token = telegram.body.accessToken;
  assert.ok(token);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, token)).body.locale, 'en');
  // Notification preferences must not overwrite the independent bot language.
  assert.equal((await request(admin, '/api/miniapp/preferences', 'PATCH', { enabled: true, preferences: { pairings: false } })).status, 200);
  assert.equal((await request(admin, '/api/miniapp/summary')).body.locale, 'en');
  await setBotLanguage('ru');
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, token)).body.locale, 'ru');
  assert.equal((await request(admin, '/api/miniapp/session', 'POST')).body.locale, 'ru');
  assert.equal((await request(owner, '/api/miniapp/summary')).body.locale, 'ru');
});

test('only an administrator link can be claimed and confirmed; demotion cancels pending access', async () => {
  const r = await request(admin, '/api/telegram/link', 'POST');
  const code = new URL(r.body.url).searchParams.get('start');
  await update(admin, '/start ' + code);
  const { rows: [job] } = await pool.query('SELECT * FROM telegram_outbox WHERE chat_id=$1', [admin.telegramId]);
  assert.ok(await payloadFor(pool, job));
  await pool.query('UPDATE users SET is_admin=FALSE WHERE id=$1', [admin.id]);
  assert.equal(await payloadFor(pool, job), null);
  assert.equal((await request(admin, '/api/telegram/confirm', 'POST', { telegramId: admin.telegramId })).status, 403);
  const oldCode = crypto.randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO telegram_link_tokens(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')", [player.id, hash(oldCode)]);
  await update(player, '/start link_' + oldCode);
  assert.equal((await pool.query('SELECT telegram_id FROM telegram_link_tokens WHERE user_id=$1', [player.id])).rows[0].telegram_id, null);
  await pool.query('UPDATE users SET is_admin=TRUE WHERE id=$1', [admin.id]);
  assert.equal((await request(admin, '/api/telegram/confirm', 'POST', { telegramId: admin.telegramId })).status, 200);
});

test('commands and queued replies are restricted, including legacy unlinked payloads', async () => {
  const a = await link(admin); const p = await link(player);
  await update(player, '/tournaments'); await update(owner, '/start');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_outbox')).rows[0].n, 0);
  await update(admin, '/profile');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_outbox')).rows[0].n, 1);
  const payload = { text: 'private payload' };
  assert.deepEqual(await payloadFor(pool, { chat_id: admin.telegramId, link_id: a.id, payload }), payload);
  for (const job of [{ chat_id: player.telegramId, link_id: p.id, payload }, { chat_id: 999999, payload }]) assert.equal(await payloadFor(pool, job), null);
  await pool.query("UPDATE users SET suspended_until=NOW()+INTERVAL '1 hour' WHERE id=$1", [admin.id]);
  assert.equal(await payloadFor(pool, { chat_id: admin.telegramId, link_id: a.id, payload }), null);
});

test('event fanout includes only admins; queued notifications are rejected after demotion', async () => {
  await link(admin); await link(player);
  for (const user of [admin, player]) await pool.query("INSERT INTO challenges(from_user_id,to_user_id,status) VALUES($1,$2,'pending')", [owner.id, user.id]);
  await expandEvents(pool);
  const { rows } = await pool.query('SELECT * FROM telegram_outbox WHERE notification IS NOT NULL');
  assert.equal(rows.length, 1); assert.equal(String(rows[0].chat_id), String(admin.telegramId));
  assert.ok(await payloadFor(pool, rows[0]));
  await pool.query('UPDATE users SET is_admin=FALSE WHERE id=$1', [admin.id]);
  assert.equal(await payloadFor(pool, rows[0]), null);
});

test('turning off the preview restriction preserves ordinary linked-user access', async () => {
  process.env.TELEGRAM_ADMIN_ONLY = 'false';
  await link(player);
  assert.equal((await request(player, '/api/miniapp/session', 'POST')).body.authenticated, true);
  assert.equal((await request(player, '/api/miniapp/summary')).status, 200);
  await update(player, '/profile');
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_outbox')).rows[0].n, 1);
});

test('API host without a worker allows ordinary players to link and use cookie and Telegram sessions', async () => {
  publicApiHost();
  const initial = await request(player, '/api/telegram/status');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.available, true);
  assert.equal(initial.body.adminOnly, false);
  assert.equal(initial.body.link, null);
  assert.equal((await request(null, '/api/miniapp/session', 'POST', { initData: initData(player) })).body.reason, 'not_linked');

  const created = await request(player, '/api/telegram/link', 'POST');
  assert.equal(created.status, 200);
  // The remote poller shares this database; claiming still requires website confirmation.
  await update(player, '/start ' + new URL(created.body.url).searchParams.get('start'));
  const claimed = await request(player, '/api/telegram/status');
  assert.equal(claimed.body.pending.claimed, true);
  assert.equal(claimed.body.link, null);
  assert.equal((await request(player, '/api/telegram/confirm', 'POST', { telegramId: owner.telegramId })).status, 409);
  const confirmed = await request(player, '/api/telegram/confirm', 'POST', { telegramId: player.telegramId, locale: 'en' });
  assert.equal(confirmed.status, 200);
  assert.equal(String(confirmed.body.link.telegram_id), String(player.telegramId));
  assert.equal(confirmed.body.pending, null);

  const cookie = await request(player, '/api/miniapp/session', 'POST');
  assert.equal(cookie.body.authenticated, true);
  assert.equal(cookie.body.adminOnly, false);
  assert.equal(cookie.body.user.isAdmin, false);
  assert.equal((await request(player, '/api/miniapp/summary')).status, 200);
  const telegram = await request(null, '/api/miniapp/session', 'POST', { initData: initData(player) });
  assert.equal(telegram.status, 200);
  assert.equal(telegram.body.locale, 'en');
  assert.ok(telegram.body.accessToken);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, telegram.body.accessToken)).status, 200);

  assert.equal((await request(player, '/api/telegram/link', 'DELETE')).status, 200);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, telegram.body.accessToken)).status, 401);
});

test('public API access without a worker still enforces signatures, CSRF and game permissions', async () => {
  publicApiHost();
  await link(player);
  const forged = new URLSearchParams(initData(player));
  forged.set('user', JSON.stringify({ id: owner.telegramId }));
  assert.equal((await request(null, '/api/miniapp/session', 'POST', { initData: forged.toString() })).status, 401);
  assert.equal((await request(null, '/api/miniapp/summary')).status, 401);
  const session = await request(null, '/api/miniapp/session', 'POST', { initData: initData(player) });
  assert.equal(session.status, 200);
  const token = session.body.accessToken;
  assert.ok(token);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, token + 'invalid')).status, 401);

  const csrf = await fetch(origin + '/api/telegram/preferences', { method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: player.cookie, 'X-Telegram-Account': String(player.id) },
    body: JSON.stringify({ enabled: false }) });
  assert.equal(csrf.status, 403);
  await csrf.arrayBuffer();
  const foreign = await games.insert(pool, { challengeId: null, playerIds: [admin.id, owner.id] });
  for (const [path, method] of [[`/api/miniapp/games/${foreign.id}`, 'GET'], [`/api/miniapp/games/${foreign.id}/result`, 'POST']]) {
    assert.equal((await request(null, path, method, {}, token)).status, 403);
  }
  assert.equal((await games.findById(pool, foreign.id)).status, 'open');
  await pool.query("UPDATE users SET suspended_until=NOW()+INTERVAL '1 hour' WHERE id=$1", [player.id]);
  assert.equal((await request(null, '/api/miniapp/summary', 'GET', null, token)).status, 403);
});

test('public API host without a worker preserves ordinary-player notification eligibility and opt-outs', async () => {
  publicApiHost();
  await link(player);
  await pool.query("INSERT INTO challenges(from_user_id,to_user_id,status) VALUES($1,$2,'pending')", [owner.id, player.id]);
  // Simulate queue expansion and eligibility checks performed by the separate worker.
  await expandEvents(pool);
  const { rows } = await pool.query('SELECT * FROM telegram_outbox WHERE notification IS NOT NULL');
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].chat_id), String(player.telegramId));
  const payload = await payloadFor(pool, rows[0]);
  assert.ok(payload);
  assert.equal(new URL(payload.reply_markup.inline_keyboard[0][0].url).origin, 'https://killteamcompanion.com');

  assert.equal((await request(player, '/api/telegram/preferences', 'PATCH', { preferences: { invitations: false } })).status, 200);
  assert.equal(await payloadFor(pool, rows[0]), null);
  assert.equal((await request(player, '/api/telegram/preferences', 'PATCH', { preferences: { invitations: true }, enabled: false })).status, 200);
  assert.equal(await payloadFor(pool, rows[0]), null);
  assert.equal((await request(player, '/api/telegram/preferences', 'PATCH', { enabled: true })).status, 200);
  assert.ok(await payloadFor(pool, rows[0]));
});
