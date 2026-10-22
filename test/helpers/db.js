const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { SCHEMAS, SEARCH_PATH } = require("../../src/db/schemas");

const ENV_PATH = path.join(__dirname, "..", "..", ".env");
if (fs.existsSync(ENV_PATH)) {
  process.loadEnvFile?.(ENV_PATH);
}

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
}
// App code (notification workers, getPool) reads DATABASE_URL. Integration
// suites often only export TEST_DATABASE_URL; mirror it before config loads.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

let pool = null;

function testPool() {
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL, options: `-c search_path=${SEARCH_PATH}` });
  return pool;
}

const TABLES = [
  "notification_inbox_state",
  "tournament_audit_events",
  "tournament_matches",
  "tournament_rounds",
  "tournament_participants",
  "tournaments",
  "sessions",
  "feedback",
  "game_participants",
  "games",
  "challenges",
  "users"
];

async function resetDatabase() {
  const client = await testPool().connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = ANY($1)`, [['public', ...SCHEMAS]]
    );
    const existing = new Set(rows.map((row) => row.tablename));
    const present = TABLES.filter((table) => existing.has(table));
    if (present.length) {
      await client.query(`TRUNCATE ${present.join(", ")} RESTART IDENTITY CASCADE`);
    }
  } finally {
    client.release();
  }
}

async function closeTestPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { TEST_DATABASE_URL, testPool, resetDatabase, closeTestPool };
