const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const { PassThrough } = require('node:stream');
const { EventEmitter } = require('node:events');
Object.assign(process.env, { TGTV_ENV_LOADED: '1', TELEGRAM_MODE: 'polling', TELEGRAM_ADMIN_ONLY: 'true',
  TELEGRAM_BOT_USERNAME: 'PreviewTestBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32), SITE_URL: 'https://example.com',
  TELEGRAM_TUNNEL_PORT: '9443', TELEGRAM_MINI_APP_URL: '' });
const { configuration } = require('../../src/telegram/config');
const { call } = require('../../src/telegram/client');

test('tunnel keeps Telegram TLS identity and sends the request to loopback only', async t => {
  t.mock.method(https, 'request', (options, callback) => {
    assert.equal(options.hostname, '127.0.0.1'); assert.equal(options.port, 9443);
    assert.equal(options.servername, 'api.telegram.org'); assert.equal(options.headers.Host, 'api.telegram.org');
    assert.notEqual(options.rejectUnauthorized, false); assert.ok(options.signal);
    const req = new EventEmitter();
    req.end = body => {
      assert.deepEqual(JSON.parse(body), { offset: 12 });
      const res = new PassThrough(); res.statusCode = 200; callback(res);
      res.end(JSON.stringify({ ok: true, result: [] }));
    };
    return req;
  });
  assert.deepEqual(await call('getUpdates', { offset: 12 }), []);
});
test('transport errors never expose the token or underlying URL', async t => {
  t.mock.method(https, 'request', () => { throw Error(process.env.TELEGRAM_BOT_TOKEN); });
  await assert.rejects(call('getMe'), err => err.message === 'telegram_network_error' && err.retryable === true);
});

test('transport preserves only safe edit failure classifications and bounded retry metadata', async t => {
  let description = 'Bad Request: message is not modified';
  let errorCode = 400;
  t.mock.method(https, 'request', (options, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      const res = new PassThrough(); res.statusCode = errorCode; callback(res);
      res.end(JSON.stringify({ ok: false, error_code: errorCode, description, parameters: { retry_after: 12 } }));
    };
    return req;
  });
  await assert.rejects(call('editMessageText'), error => error.description === description && error.code === 400);
  description = 'Bad Request: message to edit not found';
  await assert.rejects(call('editMessageText'), error => error.description === description);
  description = process.env.TELEGRAM_BOT_TOKEN;
  await assert.rejects(call('editMessageText'), error => !JSON.stringify(error).includes(description));
  errorCode = 429;
  await assert.rejects(call('sendMessage'), error => error.retryable === true && error.retryAfter === 12);
});
test('invalid restriction values fail closed and invalid tunnel ports fail configuration', () => {
  process.env.TELEGRAM_ADMIN_ONLY = 'yes';
  assert.throws(configuration, /TELEGRAM_ADMIN_ONLY/);
  process.env.TELEGRAM_ADMIN_ONLY = 'true';
  for (const value of ['-1', '65536', 'no', '1.5']) {
    process.env.TELEGRAM_TUNNEL_PORT = value; assert.throws(configuration, /TELEGRAM_TUNNEL_PORT/);
  }
  process.env.TELEGRAM_TUNNEL_PORT = '9443';
});
