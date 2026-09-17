const { Pool } = require("pg");

const { DATABASE_URL, PGSSL, requireDatabaseUrl } = require("../config");
const { logError } = require("../http/logger");

// Bounds how long pool.connect() waits for a free client. Without this, pool
// exhaustion (Blocker 2: e.g. several slow avatar uploads each holding a
// transaction's connection open) means every later request, including plain
// GETs, queues forever instead of failing with a clear error.
const CONNECTION_TIMEOUT_MS = 5000;

let pool = null;

function getPool(connectionString = DATABASE_URL) {
  if (pool) return pool;
  pool = new Pool({
    connectionString: requireDatabaseUrl(connectionString),
    ssl: PGSSL ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS
  });
  // node-postgres emits "error" on the Pool itself when an *idle* client
  // fails (e.g. Postgres drops the connection). EventEmitter's default
  // behaviour for an unhandled "error" event is to throw, which would crash
  // the whole process on a transient Postgres blip - and under pm2 that's an
  // automatic restart on every hiccup. Log it and keep serving.
  pool.on("error", (err) => {
    logError("idle postgres client error", err);
  });
  return pool;
}

async function closePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  let releaseErr;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      // The caller needs to see the ORIGINAL error (e.g. an HttpError that
      // maps to a meaningful 4xx) - losing it behind a rollback failure would
      // turn a clear failure into a confusing one. A ROLLBACK failing here
      // (connection dropped, failover) almost always means the connection
      // itself is dead, so mark it for disposal instead of returning it to
      // the pool as if it were healthy.
      logError("rollback failed while unwinding a failed transaction", rollbackErr);
      releaseErr = rollbackErr;
    }
    throw err;
  } finally {
    client.release(releaseErr);
  }
}

module.exports = { getPool, closePool, withClient, withTransaction };
