// Dedicated Telegram delivery/polling process. No HTTP server, migrations,
// email worker or tournament notification producer runs in this process.
function validateConfiguration(config, service) {
  if (service !== 'tournaments') throw Error('Telegram worker requires SERVICE_NAME=tournaments');
  if (!config.enabled || !config.workerEnabled || config.mode !== 'polling') {
    throw Error('Telegram worker requires polling and TELEGRAM_WORKER_ENABLED=true');
  }
}

async function main() {
  require('../src/config');
  const config = require('../src/telegram/config').configuration();
  validateConfiguration(config, process.env.SERVICE_NAME);
  const { getPool, closePool } = require('../src/db/pool');
  const { call } = require('../src/telegram/client');
  let stopWorker;
  let closing = false;
  async function stop() {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 30000);
    deadline.unref();
    try {
      if (stopWorker) await stopWorker();
      await closePool();
    } finally {
      clearTimeout(deadline);
    }
  }
  try {
    const { rows: [database] } = await getPool().query(
      "SELECT current_user AS role, to_regclass('telegram_state') IS NOT NULL AS ready"
    );
    if (database.role !== 'kt_tournaments' || !database.ready) {
      throw Error('Telegram worker requires the provisioned tournaments database role and schema');
    }
    const me = await call('getMe');
    if (me.username.toLowerCase() !== config.username.toLowerCase()) throw Error('Bot identity mismatch');
    const { rows: [identity] } = await getPool().query("SELECT value FROM telegram_state WHERE key='bot-id'");
    if (identity && identity.value !== String(me.id)) throw Error('Stored bot identity mismatch');
    const webhook = await call('getWebhookInfo');
    if (webhook.url) throw Error('Remove the webhook before starting the polling worker');
    if (process.argv.includes('--check')) {
      console.log(JSON.stringify({ event: 'telegram-worker-check', ready: true, bot: me.username, adminOnly: config.adminOnly }));
      await stop();
      return;
    }
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.once(signal, () => { void stop().then(() => process.exit(0), () => process.exit(1)); });
    }
    stopWorker = require('../src/telegram/worker').startWorker();
    console.log(JSON.stringify({ event: 'telegram-worker-started', bot: me.username, adminOnly: config.adminOnly }));
  } catch (error) {
    await stop();
    throw error;
  }
}

if (require.main === module) main().catch(() => {
  console.error(JSON.stringify({ event: 'telegram-worker-start-failed', message: 'Check database role, Telegram configuration and connectivity; credentials omitted.' }));
  process.exitCode = 1;
});
module.exports = { validateConfiguration };
