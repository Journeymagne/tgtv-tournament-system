const { Pool } = require("pg");

process.loadEnvFile?.(require("node:path").join(__dirname, "..", "..", ".env"));

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set. See .env.example.");
}

let pool = null;

function testPool() {
  if (!pool) pool = new Pool({ connectionString: TEST_DATABASE_URL });
  return pool;
}

const TABLES = [
  "tournament_audit_events",
  "tournament_matches",
  "tournament_rounds",
  "tournament_participants",
  "tournaments",
  "sessions",
  "feedback",
  "games",
  "challenges",
  "users"
];

async function resetDatabase() {
  const client = await testPool().connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
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
