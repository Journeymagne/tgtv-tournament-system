const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { TEST_DATABASE_URL } = require('../helpers/db');
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool } = require('../../src/db/pool');
const { migrate } = require('../../src/db/migrate');
const { SERVICES } = require('../../src/services/catalog');
const { environments } = require('../../scripts/service-runtime');
const { createClient } = require('../helpers/client');
const root = path.resolve(__dirname, '../..');
const children = new Map();
const allocatedPorts = new Set();
let origin, base;
async function port() {
  // Closing a reservation allows the OS to return the same ephemeral port on
  // the next call. Keep service/gateway assignments distinct before spawning.
  for (;;) {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const value = server.address().port;
    await new Promise(resolve => server.close(resolve));
    if (allocatedPorts.has(value)) continue;
    allocatedPorts.add(value);
    return value;
  }
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
    COMPANION_ORIGIN: '', SITE_URL: '', EMAIL_PROVIDER: 'disabled', TELEGRAM_MODE: 'disabled', TELEGRAM_ADMIN_ONLY: 'true' };
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
async function waitForNotification(client, type, sourceId) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const { items } = await ok(client.get('/api/notifications'));
    const item = items.find(item => item.type === type && (sourceId === undefined || item.sourceId === sourceId));
    if (item) return item;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.fail(`Notifications service did not deliver ${type}`);
}
test('scoped services share sessions, save prepared rounds and survive a tournament outage', async t => {
  const headers = {};
  const admin = createClient(origin, headers);
  const players = Array.from({ length: 3 }, () => createClient(origin));
  const registration = name => ({ name, password: 'password123', confirmPassword: 'password123', telegramContact: '@test' });
  const user = (await ok(admin.post('/api/register', registration('ServiceAdmin')), 201)).user;
  headers['X-Studio-Account'] = String(user.id);
  headers['X-Training-Account'] = String(user.id);
  await require('../helpers/access').grantOwner(getPool(), user);
  const playerUsers = [];
  for (const [index, player] of players.entries()) {
    playerUsers.push((await ok(player.post('/api/register', registration('ServicePlayer' + index)), 201)).user);
  }
  for (const route of ['/api/session', '/api/me', '/api/notifications', '/api/studio/drafts', '/api/faq', '/api/knowthykt/progress']) await ok(admin.get(route));
  assert.equal((await ok(admin.post('/api/miniapp/session'))).authenticated, true);
  await ok(admin.get('/api/miniapp/summary'));
  await ok(players[0].post('/api/miniapp/session'), 403);
  await ok(players[0].get('/api/miniapp/summary'), 403);
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
  const preview = await ok(admin.get(url + '/rounds/next/preview'));
  assert.equal(preview.round.mission.critOp, 'Loot');
  await ok(admin.post(url + '/start'));
  await waitForNotification(admin, 'tournament_started');

  await t.test('provider invitations cross services while event creation stays scoped', async () => {
    const [organizer, otherPlayer] = players;
    const organizerId = playerUsers[0].id;
    const logoData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=';
    const profile = { name: 'Service Club', city: 'Yerevan', logoData };
    const { provider } = await ok(admin.post('/api/tournament-providers', profile), 201);
    const { provider: otherProvider } = await ok(admin.post('/api/tournament-providers', { ...profile, name: 'Other Service Club' }), 201);
    const { invitation } = await ok(admin.post(`/api/tournament-providers/${provider.id}/invitations`, {
      userId: organizerId, role: 'organizer'
    }), 201);
    const item = await waitForNotification(organizer, 'tournament_provider_invitation', invitation.id);
    assert.equal(item.provider.id, provider.id);

    const accept = `/api/tournament-provider-invitations/${invitation.id}/accept`;
    await ok(otherPlayer.post(accept), 403);
    assert.equal((await ok(organizer.post(accept))).invitation.status, 'accepted');

    const accountsEnv = environments(base, 'ci-services').accounts;
    const db = new Client({ connectionString: accountsEnv.DATABASE_URL });
    await db.connect();
    try {
      for (const table of [
        'tournament_providers',
        'tournament_provider_memberships',
        'tournament_provider_invitations',
        'tournament_provider_audit_events'
      ]) {
        await assert.rejects(db.query('SELECT * FROM tournaments.' + table), { code: '42501' });
      }
    } finally { await db.end(); }
    assert.equal((await ok(organizer.get('/api/session'))).user.id, organizerId);
    const { user: updatedProfile } = await ok(organizer.patch('/api/me', { registerNickname: 'Service organizer' }));
    assert.equal(updatedProfile.registerNickname, 'Service organizer');
    const { user: tournamentUser } = await ok(organizer.get('/api/me'));
    assert.equal(tournamentUser.capabilities.canCreateTournaments, false);
    assert.equal(tournamentUser.capabilities.canCreateProviderEvents, true);
    await ok(admin.patch(`/api/admin/users/${organizerId}/permissions`, { canCreateTournaments: false }));

    const event = { name: 'Provider Service Cup', startsAt: '2027-02-01T12:00:00Z', format: 'swiss', swissRoundCount: 3 };
    const tournamentRoute = '/api/admin/tournaments';
    await ok(organizer.post(tournamentRoute, event), 403);
    await ok(organizer.post(tournamentRoute, { ...event, providerId: otherProvider.id }), 403);
    const { tournament } = await ok(organizer.post(tournamentRoute, { ...event, providerId: provider.id }), 201);
    assert.equal(tournament.providerId, provider.id);
  });
  for (const service of ['studio', 'knowthykt', 'tournaments', 'tierlists']) {
    const env = environments(base, 'ci-services')[service];
    const db = new Client({ connectionString: env.DATABASE_URL });
    await db.connect();
    try {
      await assert.rejects(db.query('SELECT password_hash FROM accounts.users'), error => error.code === '42501');
      if (service === 'tierlists') {
        for (const table of ['tournaments.games', 'studio.studio_projects', 'knowthykt.training_sessions']) {
          await assert.rejects(db.query('SELECT * FROM ' + table), error => error.code === '42501');
        }
      }
    }
    finally { await db.end(); }
  }
  const publicStats = await ok(createClient(origin).get('/api/statistics/kill-team?team=Kommandos'));
  assert.equal(publicStats.team, 'Kommandos');
  assert.equal(typeof publicStats.games, 'number');
  assert.ok(Array.isArray(publicStats.topPlayers));
  await stop('tournaments');
  await ok(admin.get('/api/me'), 503);
  // Optional public statistics can fail while the independent editor remains usable.
  await ok(admin.get('/api/statistics/kill-team?team=Kommandos'), 503);
  for (const route of ['/api/session', '/api/studio/drafts', '/api/faq', '/api/knowthykt/progress', '/api/tierlists']) await ok(admin.get(route));
  await stop('accounts');
  // Session validation uses the restricted DB contract, not the accounts HTTP process.
  await ok(admin.get('/api/studio/drafts'));
  await ok(admin.get('/api/knowthykt/progress'));
  await ok(admin.get('/api/tierlists'));
  await ok(admin.get('/api/tierlists/catalog'));
});
