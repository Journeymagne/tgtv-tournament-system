const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { SEARCH_PATH, SCHEMAS } = require('../../src/db/schemas');
const { environments } = require('../../scripts/service-runtime');
const { SERVICES } = require('../../src/services/catalog');
const { hashPassword } = require('../../src/domain/passwords');
const users = require('../../src/db/repositories/users');
const { hash, csrfToken } = require('../../src/telegram/security');
const password = 'Restricted-role-test-123';
const token = '123456:' + 'c'.repeat(32);
const children = [], databases = {};
let pool, envs, account, origin, telegramId = 820000;

async function availablePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
test.before(async () => {
  pool = getPool();
  await require('../helpers/schema').resetSchemas(pool);
  await migrate(pool);
  const base = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, COOKIE_SECURE: 'false', COMPANION_ORIGIN: '',
    EMAIL_PROVIDER: 'disabled', TELEGRAM_MODE: 'polling', TELEGRAM_ADMIN_ONLY: 'false', TELEGRAM_WORKER_ENABLED: 'false',
    TELEGRAM_BOT_TOKEN: token, TELEGRAM_BOT_USERNAME: 'RoleLinkTestBot', TELEGRAM_SITE_URL: '', TELEGRAM_MINI_APP_URL: '', TELEGRAM_TUNNEL_PORT: '' };
  base.PORT = String(await availablePort());
  for (const name of SERVICES) {
    base[name.toUpperCase() + '_PORT'] = String(await availablePort());
    base[name.toUpperCase() + '_DB_PASSWORD'] = crypto.randomBytes(24).toString('hex');
    process.env[name.toUpperCase() + '_DB_PASSWORD'] = base[name.toUpperCase() + '_DB_PASSWORD'];
  }
  origin = `http://127.0.0.1:${base.TOURNAMENTS_PORT}`;
  base.SITE_URL = origin;
  await require('../../scripts/provision-service-roles').provision();
  envs = environments(base, 'ci-miniapp-link');
  assert.equal(envs.accounts.TELEGRAM_BOT_TOKEN, undefined, 'accounts process must never receive a bot token');
  assert.equal(envs.tournaments.EMAIL_ENCRYPTION_KEY, undefined);
  for (const name of ['accounts', 'tournaments']) {
    const env = envs[name];
    const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '../..'), env,
      stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    children.push(child);
    let errors = '';
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${env.PORT}/health/ready`);
        if (response.ok && (await response.json()).service === name) { ready = true; break; }
      } catch {}
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `${name} service failed readiness: ${errors}`);
    databases[name] = new Pool({ connectionString: env.DATABASE_URL, options: '-c search_path=' + SEARCH_PATH });
  }
});
test.after(async () => {
  for (const child of children.reverse()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    await new Promise(resolve => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.kill('SIGTERM');
    });
  }
  for (const db of Object.values(databases)) await db.end();
  await closePool();
});
test.beforeEach(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE accounts.telegram_miniapp_link_flows,accounts.telegram_miniapp_link_budgets,tournaments.telegram_outbox,tournaments.telegram_updates,tournaments.telegram_state');
  telegramId++;
  account = await users.insert(pool, { name: 'RestrictedLinkPlayer', passwordHash: await hashPassword(password), rating: 1000, isAdmin: false });
});
function initData() {
  const data = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: telegramId, first_name: 'Role', language_code: 'en' }) });
  const key = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  data.set('hash', crypto.createHmac('sha256', key).update([...data.keys()].sort().map(k => `${k}=${data.get(k)}`).join('\n')).digest('hex'));
  return data.toString();
}
async function request(service, path, body, extraHeaders = {}, method = 'POST') {
  const response = await fetch(`http://127.0.0.1:${envs[service].PORT}${path}`, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...extraHeaders },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) })
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
async function prepare() {
  const launch = initData();
  const session = await request('tournaments', '/api/miniapp/session', { initData: launch });
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const challenge = session.body.link.challenge;
  const credentials = await request('accounts', '/api/auth/telegram-link', { challenge, name: account.name, password });
  assert.equal(credentials.status, 200, JSON.stringify(credentials.body));
  assert.equal(credentials.headers.get('set-cookie'), null);
  return { challenge, proof: credentials.body.proof, initData: launch, locale: 'en' };
}

test('actual accounts and tournaments processes complete cookie-independent linking under restricted roles', async () => {
  const flow = await prepare();
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM sessions')).rows[0].n, 0);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 0);
  const result = await request('tournaments', '/api/miniapp/link/confirm', flow);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.user.id, account.id);
  assert.equal(result.headers.get('set-cookie'), null);
  const summary = await request('tournaments', '/api/miniapp/summary', undefined, { Authorization: `Bearer ${result.body.accessToken}` }, 'GET');
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  assert.equal(summary.body.user.id, account.id);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM sessions')).rows[0].n, 0);
});

test('real service grants hide passwords/flows and expose only their narrow linking contracts', async () => {
  assert.equal((await databases.accounts.query('SELECT password_hash FROM accounts.users WHERE id=$1', [account.id])).rowCount, 1);
  for (const table of ['accounts.telegram_miniapp_link_flows', 'accounts.telegram_miniapp_link_budgets']) {
    await assert.rejects(databases.tournaments.query('SELECT * FROM ' + table), error => error.code === '42501');
  }
  await assert.rejects(databases.tournaments.query('SELECT password_hash FROM accounts.users'), error => error.code === '42501');
  await assert.rejects(databases.accounts.query('SELECT * FROM tournaments.telegram_state'), error => error.code === '42501');
  await assert.rejects(databases.accounts.query("SELECT accounts.miniapp_link_inspect('x')"), error => error.code === '42501');
  const functions = await pool.query(`SELECT p.proname,p.prosecdef,p.proconfig,
    EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='accounts' AND p.proname LIKE 'miniapp_link_%'`);
  assert.ok(functions.rows.length >= 8);
  for (const fn of functions.rows) {
    assert.equal(fn.prosecdef, true, fn.proname);
    assert.ok(fn.proconfig.includes('search_path=pg_catalog, pg_temp'), fn.proname);
    assert.equal(fn.public_execute, false, fn.proname);
  }
  for (const schema of SCHEMAS.filter(name => !['accounts', 'tournaments'].includes(name))) {
    const grants = await pool.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', ['kt_' + schema, 'accounts.miniapp_link_inspect(text)']);
    assert.equal(grants.rows[0].allowed, false);
  }
});

test('restricted website login and website-link confirmation retain behavior and revoke Mini App proofs', async () => {
  const pending = await prepare();
  const login = await request('accounts', '/api/login', { name: account.name, password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'X-Telegram-Account': String(account.id), 'X-CSRF-Token': csrfToken({ headers: { cookie } }) };
  const created = await request('tournaments', '/api/telegram/link', {}, headers);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  await pool.query('UPDATE tournaments.telegram_link_tokens SET telegram_id=$2,username=$3,display_name=$4 WHERE user_id=$1', [account.id, telegramId, 'role_user', 'Role']);
  const confirmed = await request('tournaments', '/api/telegram/confirm', { telegramId, locale: 'en' }, headers);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal((await request('tournaments', '/api/miniapp/link/confirm', pending)).status, 401);
  assert.equal((await request('tournaments', '/api/telegram/link', {}, headers, 'DELETE')).status, 200);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 0);
});

test('restricted password update triggers invalidate a proof without access to tournament tables', async () => {
  const flow = await prepare();
  await databases.accounts.query('UPDATE accounts.users SET password_hash=$2 WHERE id=$1', [account.id, await hashPassword('role-password-changed')]);
  assert.equal((await request('tournaments', '/api/miniapp/link/confirm', flow)).status, 401);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM telegram_links')).rows[0].n, 0);
});
