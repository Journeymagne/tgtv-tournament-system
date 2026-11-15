const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {
  TGTV_ENV_LOADED: '1', TELEGRAM_MODE: 'polling', TELEGRAM_ADMIN_ONLY: 'false',
  TELEGRAM_BOT_USERNAME: 'ExampleBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32),
  TELEGRAM_TUNNEL_PORT: '', TELEGRAM_MINI_APP_URL: 'https://example.com/miniapp',
  SITE_URL: 'https://example.com', TELEGRAM_SITE_URL: '', TELEGRAM_WORKER_ENABLED: 'true'
});
const { configuration } = require('../../src/telegram/config');
const { validateConfiguration } = require('../../scripts/start-telegram-worker');

test('API remains enabled while the local poller and delivery worker are disabled', async t => {
  process.env.TELEGRAM_WORKER_ENABLED = 'false';
  const config = configuration();
  assert.equal(config.enabled, true);
  assert.equal(config.workerEnabled, false);
  assert.equal(config.miniAppUrl, 'https://example.com/miniapp');
  const pool = require('../../src/db/pool');
  const client = require('../../src/telegram/client');
  t.mock.method(pool, 'getPool', () => assert.fail('Disabled worker must not access PostgreSQL'));
  t.mock.method(pool, 'withClient', () => assert.fail('Disabled worker must not access PostgreSQL'));
  t.mock.method(pool, 'withTransaction', () => assert.fail('Disabled worker must not access PostgreSQL'));
  t.mock.method(client, 'call', () => assert.fail('Disabled worker must not call Telegram'));
  await require('../../src/telegram/worker').startWorker()();
});

test('worker switch defaults on and rejects invalid values rather than starting a duplicate worker', () => {
  delete process.env.TELEGRAM_WORKER_ENABLED;
  assert.equal(configuration().workerEnabled, true);
  for (const value of ['yes', '0', 'TRUE']) {
    process.env.TELEGRAM_WORKER_ENABLED = value;
    assert.throws(configuration, /TELEGRAM_WORKER_ENABLED/);
  }
  process.env.TELEGRAM_WORKER_ENABLED = 'true';
});

test('standalone process rejects disabled workers, non-polling transport and the wrong service role', () => {
  const valid = { enabled: true, workerEnabled: true, mode: 'polling' };
  assert.doesNotThrow(() => validateConfiguration(valid, 'tournaments'));
  for (const service of [undefined, 'monolith', 'accounts']) {
    assert.throws(() => validateConfiguration(valid, service), /SERVICE_NAME=tournaments/);
  }
  for (const override of [{ enabled: false }, { workerEnabled: false }, { mode: 'webhook' }, { mode: 'local' }]) {
    assert.throws(() => validateConfiguration({ ...valid, ...override }, 'tournaments'), /requires polling/);
  }
});

test('bot origin can move independently of the website while Mini App stays on the bot origin', () => {
  process.env.SITE_URL = 'https://ktcompanion.ru';
  process.env.TELEGRAM_SITE_URL = 'https://killteamcompanion.com';
  process.env.TELEGRAM_MINI_APP_URL = 'https://killteamcompanion.com/miniapp';
  try {
    assert.equal(configuration().site, 'https://killteamcompanion.com');
    assert.equal(process.env.SITE_URL, 'https://ktcompanion.ru');
    process.env.TELEGRAM_MINI_APP_URL = 'https://unrelated.example/miniapp';
    assert.throws(configuration, /TELEGRAM_MINI_APP_URL/);
  } finally {
    delete process.env.TELEGRAM_SITE_URL;
    process.env.SITE_URL = 'https://example.com';
    process.env.TELEGRAM_MINI_APP_URL = 'https://example.com/miniapp';
  }
});
