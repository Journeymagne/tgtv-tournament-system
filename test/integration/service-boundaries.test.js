const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { SERVICES } = require('../../src/services/catalog');
const { environments } = require('../../scripts/service-runtime');
const { createClient } = require('../helpers/client');
const root = path.resolve(__dirname, '../..');
const children = new Map();
let origin, base;
async function port() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const value = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return value;
}
async function stop(service) {
  const child = children.get(service);
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.once('exit', () => { clearTimeout(timeout); resolve(); }); child.kill('SIGTERM');
  });
}
test.before(async () => {
  await migrate(getPool());
  await getPool().query('TRUNCATE tournaments, users RESTART IDENTITY CASCADE');
  base = { ...process.env, DATABASE_URL: TEST_DATABASE_URL, PORT: String(await port()), COOKIE_SECURE: 'false',
    COMPANION_ORIGIN: '', SITE_URL: '', EMAIL_PROVIDER: 'disabled', TELEGRAM_MODE: 'disabled' };
  for (const service of SERVICES) {
    base[service.toUpperCase() + '_PORT'] = String(await port());
    base[service.toUpperCase() + '_DB_PASSWORD'] = randomBytes(24).toString('hex');
    process.env[service.toUpperCase() + '_DB_PASSWORD'] = base[service.toUpperCase() + '_DB_PASSWORD'];
  }
  await require('../../scripts/provision-service-roles').provision();
  for (const [service, env] of Object.entries(environments(base, 'ci-services'))) {
    const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    children.set(service, child);
    let errors = ''; child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-5000); });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${env.PORT}/health/ready`);
        if (response.ok && (await response.json()).service === service) { ready = true; break; }
      } catch {}
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, `${service} failed to start: ${errors}`);
  }
  origin = `http://127.0.0.1:${base.PORT}`;
});
test.after(async () => { for (const service of [...children.keys()].reverse()) await stop(service); await closePool(); });
const ok = async (promise, status = 200) => { const result = await promise; assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; };
test('scoped services share sessions, save prepared rounds and survive a tournament outage', async () => {
  const headers = {};
  const admin = createClient(origin, headers);
  const players = Array.from({ length: 3 }, () => createClient(origin));
  const registration = name => ({ name, password: 'password123', confirmPassword: 'password123', telegramContact: '@test' });
  const user = (await ok(admin.post('/api/register', registration('ServiceAdmin')), 201)).user;
  headers['X-Studio-Account'] = String(user.id);
  headers['X-Training-Account'] = String(user.id);
  await require('../helpers/access').grantOwner(getPool(), user);
  for (const [index, player] of players.entries()) {
    await ok(player.post('/api/register', registration('ServicePlayer' + index)), 201);
  }
  for (const route of ['/api/session', '/api/me', '/api/notifications', '/api/studio/drafts', '/api/faq', '/api/knowthykt/progress']) await ok(admin.get(route));
  headers['X-CSRF-Token'] = (await ok(admin.get('/api/studio/session'))).csrfToken;
  const project = require('../../public/studio/model').newProject('service-project', 'Service project');
  await ok(admin.put(`/api/studio/drafts/${project.team.id}`, { project, revision: 0 }));
  const cup = (await ok(admin.post('/api/admin/tournaments', { name: 'Service Cup', startsAt: '2027-01-01T12:00:00Z', format: 'swiss', swissRoundCount: 3 }), 201)).tournament;
  const url = `/api/admin/tournaments/${cup.id}`;
  await ok(admin.post(url + '/publish'));
  for (const client of [admin, ...players]) await ok(client.post(`/api/tournaments/${cup.id}/join`, { faction: 'Kommandos' }));
  await ok(admin.post(url + '/registration/close'));
  const prepared = await ok(admin.post(url + '/rounds/next'));
  const edited = await ok(admin.post(url + '/rounds/next', { mission: { critOp: 'Loot' } }));
  assert.notEqual(edited.rounds[0].id, prepared.rounds[0].id);
  assert.equal(edited.rounds[0].mission.critOp, 'Loot');
  await ok(admin.post(url + '/start'));
  let delivered = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const inbox = await ok(admin.get('/api/notifications'));
    if (inbox.items.some(item => item.type === 'tournament_started')) { delivered = true; break; }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(delivered, 'tournament worker and notification service must deliver across scoped schemas');
  for (const service of ['studio', 'knowthykt', 'tournaments']) {
    const env = environments(base, 'ci-services')[service];
    const { Client } = require('pg'); const db = new Client({ connectionString: env.DATABASE_URL });
    await db.connect();
    try { await assert.rejects(db.query('SELECT password_hash FROM accounts.users'), error => error.code === '42501'); }
    finally { await db.end(); }
  }
  await stop('tournaments');
  await ok(admin.get('/api/me'), 503);
  for (const route of ['/api/session', '/api/studio/drafts', '/api/faq', '/api/knowthykt/progress']) await ok(admin.get(route));
  await stop('accounts');
  // Session validation uses the restricted DB contract, not the accounts HTTP process.
  await ok(admin.get('/api/studio/drafts'));
  await ok(admin.get('/api/knowthykt/progress'));
});
