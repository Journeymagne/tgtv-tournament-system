const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const migration = require("../../src/db/migrations/024_legacy_achievements");
const seed = require("../../src/db/seeds/legacy-achievements.json");
const repo = require("../../src/db/repositories/achievements");
const api = require("../../src/api/achievements");
let pool, client;

test.before(async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && /test/.test(target.pathname));
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await migrate(pool);
});
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("TRUNCATE achievements RESTART IDENTITY CASCADE");
});
test.afterEach(async () => { await client.query("ROLLBACK"); client.release(); });
test.after(async () => { await pool?.end(); });

test("legacy catalog preserves all 39 entries, Unicode and original IDs without creating awards", async () => {
  assert.equal(seed.length, 39);
  assert.equal(new Set(seed.map((entry) => entry.id)).size, 39);
  await migration.up(client);
  const { rows } = await client.query("SELECT legacy_id AS id, name, emoji, description FROM achievements WHERE legacy_source='achievement-bot' ORDER BY legacy_id");
  assert.deepEqual(rows, seed);
  assert.equal(rows.find((row) => row.id === 32).emoji, "🧔‍♂️");
  assert.equal(rows.find((row) => row.id === 67).emoji, "🧑🏻‍🚀");
  assert.equal((await client.query("SELECT * FROM achievement_awards")).rowCount, 0);
  const cards = await repo.list(client, { kind: "player" });
  assert.equal(cards.length, 39);
  assert.ok(cards.every((row) => row.imageUrl === null && row.place === null && row.tournamentId === null));
  assert.equal((await repo.list(client, { kind: "team" })).length, 0);
});

test("import keeps local IDs, existing awards and edits; repeats do not duplicate the catalog", async () => {
  // Deliberately occupy bot ID 32 with an unrelated local achievement.
  await client.query("INSERT INTO achievements (name,description,kind) SELECT 'Existing ' || n, 'Keep me', 'player' FROM generate_series(1,40) n");
  const user = (await client.query("INSERT INTO users (name,name_key,password_hash) VALUES ('SeedTest','legacy-seed-test','unused') RETURNING id")).rows[0];
  await repo.award(client, 32, "player", user.id, user.id);
  await migration.up(client);
  const imported = (await client.query("SELECT * FROM achievements WHERE legacy_source='achievement-bot' AND legacy_id=32")).rows[0];
  assert.notEqual(imported.id, 32);
  assert.equal((await repo.find(client, 32)).name, "Existing 32");
  await client.query("UPDATE achievements SET description='Edited locally' WHERE id=$1", [imported.id]);
  await migration.up(client);
  await migration.up(client);
  assert.equal((await client.query("SELECT * FROM achievements")).rowCount, 79);
  assert.equal((await repo.find(client, imported.id)).description, "Edited locally");
  assert.equal((await repo.recipients(client, 32)).length, 1);
  const next = (await client.query("INSERT INTO achievements (name,description,kind) VALUES ('New','New','team') RETURNING id")).rows[0];
  assert.ok(next.id > imported.id);
});

test("imported emoji achievements can be manually awarded and appear in player profiles", async () => {
  await migration.up(client);
  const user = (await client.query("INSERT INTO users (name,name_key,password_hash) VALUES ('AwardTest','legacy-award-test','unused') RETURNING id")).rows[0];
  const card = (await repo.list(client)).find((row) => row.legacyId === 49);
  const context = { client, user, params: { id: card.id }, body: { targetId: user.id } };
  assert.equal((await api.award(context)).awarded, true);
  assert.equal((await api.award(context)).awarded, false);
  const profile = await repo.list(client, { userId: user.id });
  assert.deepEqual(profile.map((row) => row.legacyId), [49]);
  const detail = await api.get({ client, params: { id: card.id } });
  assert.equal(detail.achievement.emoji, "🥇");
  assert.equal(detail.recipients.length, 1);
});
