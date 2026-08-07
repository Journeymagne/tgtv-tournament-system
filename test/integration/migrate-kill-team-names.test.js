const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate, MIGRATIONS } = require("../../src/db/migrate");
const migration = require("../../src/db/migrations/002_kill_team_names");

let pool;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
});

test.after(async () => {
  await pool.end();
});

// Схема поднимается только базовой миграцией и намеренно не отмечается в
// schema_migrations: тест сначала засевает данные в старом виде, и лишь затем
// migrate(pool) применяет 001 (идемпотентно) и 002.
test.beforeEach(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const client = await pool.connect();
  try {
    await MIGRATIONS[0].up(client);
  } finally {
    client.release();
  }
});

async function seedLegacyData() {
  const { rows } = await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin, challenge_credits)
     VALUES ('Alpha', 'alpha', 's:h', 1000, true,
             '[{"team":"Tempestus Aquillons","action":"credit"},
               {"team":"XV26 Stealth Suits","action":"credit"},
               {"team":"Kasrkin","action":"credit"}]'::jsonb),
            ('Bravo', 'bravo', 's:h', 1000, false, '[]'::jsonb)
     RETURNING id`
  );
  const [alpha, bravo] = rows.map((row) => row.id);

  await pool.query(
    `INSERT INTO games (player_ids, status, result, pending_result)
     VALUES ($1::int[], 'completed',
             jsonb_build_object(
               'winnerId', $2::int,
               'scores', jsonb_build_object(
                 $2::text, jsonb_build_object('faction', 'Tempestus Aquillons', 'total', 12),
                 $3::text, jsonb_build_object('faction', 'XV26 Stealth Suits', 'total', 8))),
             NULL),
            ($1::int[], 'pending_confirmation', NULL,
             jsonb_build_object(
               'submittedBy', $2::int,
               'result', jsonb_build_object(
                 'winnerId', $2::int,
                 'scores', jsonb_build_object(
                   $2::text, jsonb_build_object('faction', 'XV26 Stealth Suits', 'total', 10)))))`,
    [[alpha, bravo], alpha, bravo]
  );

  return { alpha, bravo };
}

test("миграция переписывает faction в завершённом результате", async () => {
  const { alpha, bravo } = await seedLegacyData();
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT result FROM games WHERE status = 'completed'`
  );
  const scores = rows[0].result.scores;

  assert.equal(scores[alpha].faction, "Tempestus Aquilons");
  assert.equal(scores[bravo].faction, "XV26 Stealth Battlesuits");
  assert.equal(scores[alpha].total, 12, "остальные поля не должны меняться");
});

test("миграция переписывает faction в ожидающем результате", async () => {
  const { alpha } = await seedLegacyData();
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT pending_result FROM games WHERE status = 'pending_confirmation'`
  );
  assert.equal(
    rows[0].pending_result.result.scores[alpha].faction,
    "XV26 Stealth Battlesuits"
  );
});

test("миграция переписывает team в challenge_credits", async () => {
  await seedLegacyData();
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT challenge_credits FROM users WHERE name_key = 'alpha'`
  );
  assert.deepEqual(
    rows[0].challenge_credits.map((credit) => credit.team),
    ["Tempestus Aquilons", "XV26 Stealth Battlesuits", "Kasrkin"]
  );
});

test("миграция идемпотентна", async () => {
  await seedLegacyData();
  await migrate(pool);

  const before = await pool.query("SELECT result, id FROM games ORDER BY id");
  await pool.query("DELETE FROM schema_migrations WHERE version = 2");
  await migrate(pool);
  const after = await pool.query("SELECT result, id FROM games ORDER BY id");

  assert.deepEqual(after.rows, before.rows);
});

test("миграция не трогает записи без старых названий", async () => {
  await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin, challenge_credits)
     VALUES ('Solo', 'solo', 's:h', 1000, false,
             '[{"team":"Kasrkin","action":"credit"}]'::jsonb)`
  );
  await migrate(pool);

  const { rows } = await pool.query(
    `SELECT challenge_credits FROM users WHERE name_key = 'solo'`
  );
  assert.deepEqual(rows[0].challenge_credits, [{ team: "Kasrkin", action: "credit" }]);
});

test("миграция переживает пустые и отсутствующие структуры", async () => {
  await pool.query(
    `INSERT INTO users (name, name_key, password_hash, rating, is_admin, challenge_credits)
     VALUES ('Empty', 'empty', 's:h', 1000, false, NULL)`
  );
  await pool.query(
    `INSERT INTO games (player_ids, status, result) VALUES ('{1}'::int[], 'open', NULL)`
  );

  await assert.doesNotReject(() => migrate(pool));
});

test("rewriteResult не меняет объект без старых названий", () => {
  const result = { winnerId: 1, scores: { 1: { faction: "Kasrkin" } } };
  assert.equal(migration.rewriteResult(result), null);
});

test("rewriteResult возвращает изменённую копию", () => {
  const result = { winnerId: 1, scores: { 1: { faction: "XV26 Stealth Suits", total: 5 } } };
  const rewritten = migration.rewriteResult(result);

  assert.equal(rewritten.scores[1].faction, "XV26 Stealth Battlesuits");
  assert.equal(rewritten.scores[1].total, 5);
  assert.equal(result.scores[1].faction, "XV26 Stealth Suits", "исходник не мутируется");
});
