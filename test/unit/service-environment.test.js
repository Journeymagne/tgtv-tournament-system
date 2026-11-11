const test = require('node:test');
const assert = require('node:assert/strict');
const { SERVICES } = require('../../src/services/catalog');
const { serviceEnvironment } = require('../../scripts/service-runtime');
const { clusterServiceEnvironment } = require('../../scripts/start-services');
const { singleServiceEnvironment } = require('../../scripts/start-service');

function credentials() {
  return { DATABASE_URL: 'postgres://owner:owner-secret@127.0.0.1:5432/app', DB_PASSWORD: 'owner-compose-secret',
    TEST_DATABASE_URL: 'postgres://test_owner:test-secret@127.0.0.1:5432/test', NODE_ENV: 'development', PORT: '3000',
    TGTV_ENV_LOADED: '0', EMAIL_PROVIDER: 'resend', EMAIL_OUTBOX_KEY: 'outbox-secret', RESEND_API_KEY: 'mail-secret',
    TELEGRAM_MODE: 'polling', TELEGRAM_BOT_TOKEN: 'telegram-secret',
    FUTURE_DB_PASSWORD: 'future-secret', RETIRED_DATABASE_URL: 'postgres://retired:retired-secret@127.0.0.1/old',
    ...Object.fromEntries(SERVICES.flatMap(name => [
      [name.toUpperCase() + '_DB_PASSWORD', name + '-password-' + 'a'.repeat(32)],
      [name.toUpperCase() + '_DATABASE_URL', `postgres://kt_${name}:${name}-explicit-secret@127.0.0.1:5432/${name}`]
    ])) };
}
const launchers = {
  release: (base, service) => serviceEnvironment(base, service, 'isolation-check'),
  cluster: (base, service) => clusterServiceEnvironment(base, service, 4400),
  single: (base, service) => singleServiceEnvironment(base, service)
};

for (const [launcher, build] of Object.entries(launchers)) {
  test(`${launcher} launches with scoped credentials and leaves migrator credentials intact`, () => {
    const base = credentials(), original = { ...base };
    for (const service of [...SERVICES, 'gateway']) {
      const env = build(base, service);
      assert.equal(env.TGTV_ENV_LOADED, '1', '.env must not repopulate stripped secrets');
      assert.equal(env.NODE_ENV, launcher === 'release' ? 'production' : 'development');
      assert.equal(env.DB_PASSWORD, undefined);
      assert.equal(env.TEST_DATABASE_URL, undefined);
      assert.equal(Object.keys(env).some(key => /_(?:DB_PASSWORD|DATABASE_URL)$/.test(key)), false);
      if (['gateway', 'calculators'].includes(service)) assert.equal(env.DATABASE_URL, '');
      else {
        const scoped = new URL(env.DATABASE_URL);
        assert.equal(scoped.username, 'kt_' + service);
        assert.equal(scoped.password, launcher === 'single' ? service + '-explicit-secret' : base[service.toUpperCase() + '_DB_PASSWORD']);
      }
      assert.equal(env.RESEND_API_KEY, service === 'accounts' ? 'mail-secret' : undefined);
      assert.equal(env.EMAIL_OUTBOX_KEY, service === 'accounts' ? 'outbox-secret' : undefined);
      assert.equal(env.EMAIL_PROVIDER, service === 'accounts' ? 'resend' : 'disabled');
      assert.equal(env.TELEGRAM_BOT_TOKEN, service === 'tournaments' ? 'telegram-secret' : undefined);
      assert.equal(env.TELEGRAM_MODE, service === 'tournaments' ? 'polling' : 'disabled');
      const serialized = JSON.stringify(env);
      for (const secret of ['owner-secret', 'owner-compose-secret', 'test-secret', 'future-secret', 'retired-secret']) assert.equal(serialized.includes(secret), false);
      for (const other of SERVICES.filter(name => name !== service)) {
        assert.equal(serialized.includes(base[other.toUpperCase() + '_DB_PASSWORD']), false);
        assert.equal(serialized.includes(other + '-explicit-secret'), false);
      }
    }
    assert.deepEqual(base, original, 'owner provisioning must keep the unchanged base environment');
  });
}

test('single-service password fallback preserves the derived role URL after stripping raw passwords', () => {
  const base = credentials();
  delete base.TIERLISTS_DATABASE_URL;
  const env = singleServiceEnvironment(base, 'tierlists');
  assert.equal(new URL(env.DATABASE_URL).username, 'kt_tierlists');
  assert.equal(new URL(env.DATABASE_URL).password, base.TIERLISTS_DB_PASSWORD);
  assert.equal(env.TIERLISTS_DB_PASSWORD, undefined);
  assert.equal(base.DB_PASSWORD, 'owner-compose-secret');
});
