const http = require("node:http");

const { PORT, HOST, requireDatabaseUrl } = require("./src/config");
const { getPool, closePool, withClient, withTransaction } = require("./src/db/pool");
const { migrate } = require("./src/db/migrate");
const { createRouter } = require("./src/http/router");
const { sendStatic } = require("./src/http/static");
const { logError } = require("./src/http/logger");
const routes = require("./src/api/routes");
const { loadUserFromRequest } = require("./src/api/auth");

const router = createRouter(routes, {
  withClient,
  withTransaction,
  loadUser: loadUserFromRequest
});

const server = http.createServer((req, res) => {
  if ((req.url || "").startsWith("/api/")) {
    router(req, res);
    return;
  }
  sendStatic(req, res);
});

async function start() {
  requireDatabaseUrl();
  await migrate(getPool());
  await new Promise((resolve) => server.listen(PORT, HOST, resolve));
  console.log(
    JSON.stringify({
      level: "info",
      time: new Date().toISOString(),
      msg: "server started",
      url: `http://${HOST}:${PORT}`
    })
  );
}

async function stop() {
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
