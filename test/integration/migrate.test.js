const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");

const { migrate, MIGRATIONS } = require("../../src/db/migrate");

let pool;

test.before(() => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
});

test("версии миграций уникальны и идут по возрастанию", () => {
  const versions = MIGRATIONS.map((item) => item.version);
  assert.deepEqual(versions, [...new Set(versions)], "версии должны быть уникальны");
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b), "версии должны возрастать");
});

test("migrate на пустой базе создаёт схему", async () => {
  const applied = await migrate(pool);
  assert.ok(applied.includes(1));

  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  const tables = rows.map((row) => row.tablename);
  for (const table of [
    "challenges",
    "feedback",
    "games",
    "schema_migrations",
    "sessions",
    "tournament_audit_events",
    "tournament_matches",
    "tournament_participants",
    "tournament_rounds",
    "tournaments",
    "users"
  ]) {
    assert.ok(tables.includes(table), `ожидалась таблица ${table}`);
  }
});

test("повторный migrate ничего не применяет", async () => {
  await migrate(pool);
  const applied = await migrate(pool);
  assert.deepEqual(applied, []);
});

test("migrate на живой базе не ломает данные", async () => {
  await migrate(pool);
  await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin)
     VALUES ('Alpha', 'alpha', 'salt:hash', 1000, true)`
  );

  await pool.query("DELETE FROM schema_migrations");
  const applied = await migrate(pool);
  assert.ok(applied.includes(1));

  const { rows } = await pool.query("SELECT name FROM users");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Alpha");
});

test("схема users содержит ожидаемые колонки", async () => {
  await migrate(pool);
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'users' ORDER BY column_name`
  );
  const columns = rows.map((row) => row.column_name);
  for (const column of [
    "avatar_data",
    "challenge_credits",
    "created_at",
    "id",
    "is_admin",
    "name",
    "name_key",
    "password_hash",
    "rating",
    "register_nickname",
    "telegram_contact",
    "updated_at"
  ]) {
    assert.ok(columns.includes(column), `ожидалась колонка users.${column}`);
  }
});

test("уникальный индекс share_token существует", async () => {
  await migrate(pool);
  const { rows } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'challenges'`
  );
  assert.ok(rows.some((row) => row.indexname === "idx_challenges_share_token"));
});
