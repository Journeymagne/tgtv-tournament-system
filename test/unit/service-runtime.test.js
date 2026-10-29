const test = require('node:test');
const assert = require('node:assert/strict');
const { serviceEnvironment, environments, transition } = require('../../scripts/service-runtime');
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
