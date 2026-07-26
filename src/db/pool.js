const { Pool } = require("pg");

const { DATABASE_URL, PGSSL, requireDatabaseUrl } = require("../config");

let pool = null;

function getPool(connectionString = DATABASE_URL) {
  if (pool) return pool;
  pool = new Pool({
    connectionString: requireDatabaseUrl(connectionString),
    ssl: PGSSL ? { rejectUnauthorized: false } : undefined
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
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, closePool, withClient, withTransaction };
