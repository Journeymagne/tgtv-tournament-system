const http = require("node:http");

const { PORT, HOST, requireDatabaseUrl } = require("./src/config");
const { getPool, closePool, withClient, withTransaction } = require("./src/db/pool");
const { migrate } = require("./src/db/migrate");
const { createRouter } = require("./src/http/router");
const { sendStatic } = require("./src/http/static");
const { sendText, sendJson } = require("./src/http/io");
const { logError } = require("./src/http/logger");
const { handleSeoRequest } = require("./src/http/seo");
const { handleSiteRequest } = require("./src/http/sites");
const { handleCombatRequest } = require("./src/http/combat");
const { serviceName, pageService } = require('./src/services/catalog');
const service = serviceName();
const databaseService = !['gateway','calculators'].includes(service);
const routes = service === 'monolith' ? require('./src/api/routes') : databaseService ? require('./src/api/routes-' + service) : [];
const gateway = service === 'gateway' ? require('./src/services/gateway').createGateway() : null;
const { startWorker } = require("./src/email/worker");
let stopEmailWorker = async () => {};
let stopTelegramWorker = async () => {};
let stopNotificationWorker = async () => {};
let stopTournamentNotifications = async () => {};
const { loadUserFromRequest } = require("./src/api/auth");

const router = createRouter(routes, {
  withClient,
  withTransaction,
  loadUser: loadUserFromRequest
});

const server = http.createServer((req, res) => {
  // Deployment checks must verify the new process, not another listener or an old release.
  if (process.env.TGTV_RELEASE_ID) res.setHeader("X-KT-Release", process.env.TGTV_RELEASE_ID);
  res.setHeader('X-KT-Service', service);
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (['/health/live','/health/ready'].includes(pathname) && ['GET','HEAD'].includes(req.method)) {
    const ready = pathname === '/health/ready' && databaseService ? withClient(client => client.query('SELECT 1')) : Promise.resolve();
    ready.then(() => sendJson(res, 200, { status: 'ok', service }))
      .catch(() => sendJson(res, 503, { status: 'unavailable', service }));
    return;
  }
  if (handleSiteRequest(req, res)) return;
  if (gateway?.(req, res)) return;
  if (['monolith','calculators'].includes(service) && handleCombatRequest(req, res)) return;
  if ((req.url || "").startsWith("/api/")) {
    router(req, res);
    return;
  }
  if (service !== 'monolith' && service !== 'gateway' && pageService(pathname) !== service) {
    sendText(res, 404, 'Not found'); return;
  }
  if (!['monolith','tournaments'].includes(service)) { sendStatic(req, res); return; }
  handleSeoRequest(req, res, { withClient })
    .then((handled) => {
      if (!handled) sendStatic(req, res);
    })
    .catch((err) => {
      logError("seo route failed", err);
      sendText(res, 500, "Server error");
    });
});

async function start() {
  if (databaseService) {
    requireDatabaseUrl();
    if (service === 'monolith') await migrate(getPool());
    else {
      const { rows } = await getPool().query('SELECT max(version) AS version FROM public.schema_migrations');
      if (rows[0].version < 60) throw Error('Run npm run db:migrate before starting the services');
    }
  }
  if (['monolith','accounts'].includes(service)) {
    require('./src/email/config').configuration(); stopEmailWorker = startWorker();
  }
  if (['monolith','tournaments'].includes(service)) {
    require('./src/telegram/config').configuration();
    stopTelegramWorker = require('./src/telegram/worker').startWorker();
    stopTournamentNotifications = require('./src/notifications/tournament-worker').startWorker();
  }
  if (['monolith','notifications'].includes(service)) stopNotificationWorker = require('./src/notifications/worker').startWorker();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, HOST, resolve); });
  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      msg: "server started", service,
      url: `http://${HOST}:${PORT}`
    })
  );
}

async function stop() {
  await stopTournamentNotifications();
  await stopNotificationWorker();
  await stopTelegramWorker();
  await stopEmailWorker();
  await new Promise((resolve) => server.close(resolve));
  await closePool();
}

if (require.main === module) {
  start().catch((err) => {
    logError("failed to start server", err);
    process.exit(1);
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  }
}

module.exports = { server, router, start, stop };
