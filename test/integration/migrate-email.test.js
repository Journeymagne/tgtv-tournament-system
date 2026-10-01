const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate, MIGRATIONS } = require("../../src/db/migrate");
test("email migration upgrades a live schema 045 without changing existing users or replaying migrations", async () => {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await client.query("BEGIN");
    await client.query("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    for (const migration of MIGRATIONS.filter(item => item.version !== 42)) {
      await migration.up(client);
      await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [migration.version, migration.name]);
    }
    await client.query("INSERT INTO users(name,name_key,password_hash,rating,is_admin) VALUES('Legacy','legacy','unchanged-hash',1234,false)");
    await client.query("COMMIT");
    const before = (await client.query("SELECT * FROM users ORDER BY id")).rows;
    const journal = (await client.query("SELECT * FROM schema_migrations ORDER BY version")).rows;
    assert.deepEqual(await migrate(pool), [42]);
    assert.deepEqual((await client.query("SELECT * FROM users ORDER BY id")).rows, before);
    assert.deepEqual((await client.query("SELECT * FROM schema_migrations WHERE version<>42 ORDER BY version")).rows, journal);
    assert.equal((await client.query("SELECT COUNT(*)::int AS count FROM user_email_accounts")).rows[0].count, 0);
    assert.deepEqual(await migrate(pool), []);
  } finally { client.release(); await pool.end(); }
});
