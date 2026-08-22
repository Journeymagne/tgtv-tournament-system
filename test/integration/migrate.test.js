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
    "game_participants",
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

test("migration 010 creates a canonical Game for a tournament match with a guest", async () => {
  await migrate(pool);
  const user = await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin)
     VALUES ('Alpha', 'alpha', 'salt:hash', 1000, true)
     RETURNING id`
  );
  const tournament = await pool.query(
    `INSERT INTO tournaments (owner_user_id, slug, status, format, swiss_round_count)
     VALUES ($1, 'migration-test', 'in_progress', 'swiss', 1)
     RETURNING id`,
    [user.rows[0].id]
  );
  const participants = await pool.query(
    `INSERT INTO tournament_participants
       (tournament_id, user_id, display_name, display_name_key, status, source)
     VALUES
       ($1, $2, 'Alpha', 'alpha', 'active', 'admin_manual'),
       ($1, NULL, 'Guest', 'guest', 'active', 'admin_manual')
     RETURNING id, user_id`,
    [tournament.rows[0].id, user.rows[0].id]
  );
  participants.rows.sort((a, b) => a.id - b.id);
  const round = await pool.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, status)
     VALUES ($1, 1, 'completed') RETURNING id`,
    [tournament.rows[0].id]
  );
  const guestResultKey = -participants.rows[1].id;
  const match = await pool.query(
    `INSERT INTO tournament_matches
       (tournament_id, round_id, round_number, status, is_bye,
        participant_a_id, participant_b_id, result, completed_at)
     VALUES ($1, $2, 1, 'completed', FALSE, $3, $4, $5::jsonb, NOW())
     RETURNING id`,
    [
      tournament.rows[0].id,
      round.rows[0].id,
      participants.rows[0].id,
      participants.rows[1].id,
      JSON.stringify({ winnerId: user.rows[0].id, scores: { [user.rows[0].id]: {}, [guestResultKey]: {} } })
    ]
  );

  await pool.query("DELETE FROM schema_migrations WHERE version = 10");
  const applied = await migrate(pool);
  assert.ok(applied.includes(10));

  const games = await pool.query(
    `SELECT g.id, g.player_ids, g.source_id, tm.game_id
     FROM games g
     JOIN tournament_matches tm ON tm.game_id = g.id
     WHERE tm.id = $1`,
    [match.rows[0].id]
  );
  assert.equal(games.rowCount, 1);
  assert.equal(games.rows[0].source_id, match.rows[0].id);
  assert.deepEqual(games.rows[0].player_ids, [user.rows[0].id]);

  const gameParticipants = await pool.query(
    `SELECT slot, user_id, tournament_participant_id, result_key
     FROM game_participants WHERE game_id = $1 ORDER BY slot`,
    [games.rows[0].id]
  );
  assert.equal(gameParticipants.rowCount, 2);
  assert.equal(gameParticipants.rows[0].user_id, user.rows[0].id);
  assert.equal(gameParticipants.rows[1].user_id, null);
  assert.equal(gameParticipants.rows[1].result_key, guestResultKey);
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
