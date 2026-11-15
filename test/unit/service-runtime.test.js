const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { serviceEnvironment, environments, releaseEnvironments, transition, verifyGateway } = require('../../scripts/service-runtime');
const { SERVICES } = require('../../src/services/catalog');
const base = { DATABASE_URL: 'postgres://owner:owner-secret@127.0.0.1:5432/app', PORT: '3000',
  EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'mail-secret', TELEGRAM_MODE: 'polling', TELEGRAM_BOT_TOKEN: 'telegram-secret',
  ...Object.fromEntries(SERVICES.map(name => [name.toUpperCase() + '_DB_PASSWORD', 'a'.repeat(48)])) };
test('service processes receive scoped credentials and only their own external workers', () => {
  for (const service of [...SERVICES, 'gateway']) {
    const env = serviceEnvironment(base, service, 'release');
    assert.equal(env.TGTV_ENV_LOADED, '1');
    assert.equal(env.HOST, '127.0.0.1');
    assert.equal(env.SERVICE_NAME, service);
    assert.equal(Object.keys(env).some(key => key.endsWith('_DB_PASSWORD')), false);
    if (['gateway', 'calculators'].includes(service)) assert.equal(env.DATABASE_URL, '');
    else assert.equal(new URL(env.DATABASE_URL).username, 'kt_' + service);
    assert.equal(env.RESEND_API_KEY, service === 'accounts' ? 'mail-secret' : undefined);
    assert.equal(env.TELEGRAM_BOT_TOKEN, service === 'tournaments' ? 'telegram-secret' : undefined);
    assert.equal(JSON.stringify(env).includes('owner-secret'), false);
  }
  assert.throws(() => environments({ ...base, STUDIO_PORT: '3000' }, 'release'), /duplicate/);
});
test('failed service startup stops new writers before restoring the previous monolith', async () => {
  const events = [];
  const previous = { mode: 'monolith' }, next = { mode: 'services' };
  const ops = Object.fromEntries(['stop','prepare','point','start','verify','save'].map(step => [step, async target => {
    events.push(step + ':' + (target?.mode || 'all'));
    if (step === 'verify' && target === next) throw Error('bad gateway');
  }]));
  await assert.rejects(transition(ops, previous, next, true), /previous runtime restored/);
  assert.deepEqual(events, ['stop:all','prepare:services','point:services','start:services','verify:services',
    'stop:all','point:monolith','start:monolith','verify:monolith','save:monolith']);
});
test('incompatible schema changes never automatically restart old writers', async () => {
  const started = [];
  await assert.rejects(transition({ stop: async () => {}, prepare: async () => {}, point: async () => {},
    start: async target => started.push(target.mode), verify: async () => { throw Error('bad'); }, save: async () => {} },
  { mode: 'monolith' }, { mode: 'services' }, false), /automatic rollback unavailable/);
  assert.deepEqual(started, ['services']);
});

function oldServicesRelease(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-runtime-release-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const services = SERVICES.filter(name => name !== 'tierlists');
  const catalogDirectory = path.join(directory, 'src', 'services');
  fs.mkdirSync(catalogDirectory, { recursive: true });
  fs.writeFileSync(path.join(catalogDirectory, 'catalog.js'), 'module.exports=' + JSON.stringify({
    SERVICES: services, DEFAULT_PORTS: Object.fromEntries(services.map((name, i) => [name, 4101 + i]))
  }));
  return { mode: 'services', directory, id: 'before-tierlists', services };
}

test('rollback starts the target release service set and ports without requiring a new service password', t => {
  const previous = oldServicesRelease(t), legacyBase = { ...base };
  delete legacyBase.TIERLISTS_DB_PASSWORD;
  const envs = releaseEnvironments(legacyBase, previous);
  assert.deepEqual(Object.keys(envs), [...previous.services, 'gateway']);
  assert.equal(envs.accounts.PORT, '4101');
  assert.equal(envs.gateway.ACCOUNTS_URL, 'http://127.0.0.1:4101');
  assert.equal(envs.tierlists, undefined);
  assert.equal(envs.accounts.TGTV_RELEASE_ID, previous.id);
  assert.equal(Object.keys(releaseEnvironments(base, previous).accounts).some(key => key.endsWith('_DB_PASSWORD')), false);
});

test('a previous monolith can restart without a service catalog', () => {
  const envs = releaseEnvironments(base, { mode: 'monolith', directory: '/no-service-catalog', id: 'monolith' });
  assert.deepEqual(Object.keys(envs), ['monolith']);
  assert.equal(envs.monolith.SERVICE_NAME, 'monolith');
  assert.equal(envs.monolith.DATABASE_URL, base.DATABASE_URL);
});

test('rollback readiness probes only services present in the previous release', async t => {
  const previous = oldServicesRelease(t), requested = [];
  const server = http.createServer((req, res) => {
    requested.push(req.url);
    const services = { '/': 'gateway', '/api/session': 'accounts', '/api/me': 'tournaments',
      '/api/notifications': 'notifications', '/api/studio/library': 'studio', '/api/faq': 'faq',
      '/knowthykt': 'knowthykt', '/combat/api/health': 'calculators' };
    res.writeHead(req.url === '/api/notifications' ? 401 : 200, {
      'X-KT-Service': services[req.url] || 'missing', 'X-KT-Release': previous.id, 'Content-Type': 'application/json'
    });
    res.end(JSON.stringify({ buildReady: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await verifyGateway({ PORT: server.address().port, TGTV_RELEASE_ID: previous.id }, previous.services);
  assert.ok(requested.includes('/api/session'));
  assert.equal(requested.some(route => route.includes('tierlist')), false);
});
