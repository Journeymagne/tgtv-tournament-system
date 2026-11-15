const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
Object.assign(process.env, { TGTV_ENV_LOADED: '1', TELEGRAM_MODE: 'polling', TELEGRAM_BOT_USERNAME: 'ExampleBot', TELEGRAM_BOT_TOKEN: '123456:' + 'a'.repeat(32), TELEGRAM_ADMIN_ONLY: 'false', SITE_URL: 'https://example.com' });
const filename = path.resolve(__dirname, '../../src/telegram/interactive-delivery.js');
const delivery = fs.existsSync(filename) ? require(filename) : {};
const menuFile = path.resolve(__dirname, '../../src/telegram/game-menu.js');
const menu = fs.existsSync(menuFile) ? require(menuFile) : {};
const ready = (api, name) => assert.equal(typeof api[name], 'function', `${name} implements reliable interactive delivery`);
test('callback grammar rejects invalid tokens indices overflow and payload suffixes', () => {
  ready(menu, 'handles'); ready(menu, 'isResultMutation'); ready(menu, 'parse');
  for (const action of ['g:l:all:next:0', 'g:v:42', 'g:s:42:submit', 'g:d:abcdefghijklmnop:9:choose:6']) assert.ok(menu.parse(action));
  for (const action of ['g:s:-1:submit', 'g:v:9007199254740993', 'g:d:a:0:submit', 'g:d:abcdefghijklmnop:0:choose:-1', 'g:v:1:x', 'g:l:all:next:NaN']) assert.equal(menu.parse(action), null);
  for (const mode of ['submit', 'confirm', 'reject']) assert.equal(menu.isResultMutation(`g:s:42:${mode}`), true);
  assert.equal(menu.isResultMutation('g:d:abcdefghijklmnop:8:submit'), true);
  assert.equal(menu.isResultMutation('g:d:abcdefghijklmnop:8:choose:1'), false);
});
test('delivery classifies harmless unchanged edits deleted targets and retry limits', () => {
  ready(delivery, 'failure');
  assert.equal(delivery.failure({ code: 400, description: 'Bad Request: message is not modified' }, 1).kind, 'sent');
  assert.equal(delivery.failure({ code: 400, description: 'Bad Request: message to edit not found' }, 1).kind, 'fallback');
  assert.equal(delivery.failure({ code: 429, retryAfter: 23 }, 2).delay, 23);
  assert.equal(delivery.failure({ retryable: true }, 8).kind, 'failed');
  assert.equal(delivery.failure({ code: 403, retryable: false }, 1).kind, 'failed');
});
test('callback acknowledgement starts before a delayed transaction and never claims success', async () => {
  const worker = require('../../src/telegram/worker'); ready(worker, 'processUpdate');
  const order = []; let release;
  const delayed = new Promise(resolve => { release = resolve; });
  const running = worker.processUpdate({ update_id: 90, callback_query: { id: 'cb' } }, {
    answer: async (method, body, options) => { order.push('ack'); assert.equal(method, 'answerCallbackQuery'); assert.ok(!body.text || /received|получ/i.test(body.text)); assert.ok(options.timeout <= 2000); },
    transaction: async () => { order.push('transaction'); await delayed; }
  });
  await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(order, ['ack', 'transaction']); release(); await running;
});
test('interactive tick does not await event expansion', async t => {
  const data = require('../../src/telegram/data'); const pool = require('../../src/db/pool');
  let expanded = false;
  t.mock.method(data, 'expandEvents', async () => { expanded = true; throw Error('heavy expansion cannot run on interactive lane'); });
  t.mock.method(pool, 'withTransaction', async fn => fn({ query: async () => ({ rows: [], rowCount: 0 }) }));
  delete require.cache[require.resolve('../../src/telegram/worker')];
  await require('../../src/telegram/worker').tick(); assert.equal(expanded, false);
});
test('worker keeps serving interactive work during slow expansion and shutdown drains both loops', async t => {
  const pool = require('../../src/db/pool'); const data = require('../../src/telegram/data'); const transport = require('../../src/telegram/client');
  process.env.TELEGRAM_MODE = 'webhook'; process.env.TELEGRAM_WEBHOOK_SECRET = 's'.repeat(40);
  process.env.TELEGRAM_WORKER_ENABLED = 'true'; process.env.TELEGRAM_MINI_APP_URL = '';
  const flush = () => new Promise(resolve => setImmediate(resolve));
  let claims = 0, expansions = 0, releaseExpansion;
  const held = new Promise(resolve => { releaseExpansion = resolve; });
  t.mock.method(transport, 'call', async method => { assert.equal(method, 'getMe'); return { id: 12, username: 'ExampleBot' }; });
  const client = { query: async sql => {
    if(sql.includes('WITH candidate')) claims++;
    return { rows: sql.includes("WHERE key='bot-id'") ? [{ value: '12' }] : [], rowCount: 0 };
  } };
  t.mock.method(pool, 'withTransaction', fn => fn(client));
  t.mock.method(pool, 'withClient', fn => fn(client));
  t.mock.method(data, 'expandEvents', async () => { expansions++; await held; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  delete require.cache[require.resolve('../../src/telegram/worker')];
  const stop = require('../../src/telegram/worker').startWorker();
  try {
    await flush(); t.mock.timers.tick(1000); await flush(); assert.equal(expansions, 1);
    const before = claims; t.mock.timers.tick(250); await flush(); assert.ok(claims > before, 'slow fan-out leaves the interactive loop running');
    let finished = false; const stopping = stop().then(() => { finished = true; });
    await flush(); assert.equal(finished, false, 'shutdown waits for in-flight expansion');
    const atStop = claims; t.mock.timers.tick(10000); await flush(); assert.equal(claims, atStop, 'shutdown never schedules more work');
    releaseExpansion(); await stopping; assert.equal(finished, true);
  } finally {
    releaseExpansion(); await stop(); process.env.TELEGRAM_MODE = 'polling';
    delete require.cache[require.resolve('../../src/telegram/worker')];
  }
});
