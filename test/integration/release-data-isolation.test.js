const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate, MIGRATIONS } = require("../../src/db/migrate");
const catalog = require("../../src/db/seeds/legacy-achievements.json");

test("upgrade from 2.3.2 imports the achievement catalog without demo data or awards", async () => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && /test/.test(target.pathname));
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
      for (const migration of MIGRATIONS.filter((item) => item.version <= 21)) {
        await migration.up(client);
        await client.query("INSERT INTO schema_migrations (version,name) VALUES ($1,$2)", [migration.version, migration.name]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const { rows: [user] } = await pool.query(`INSERT INTO users (name,name_key,password_hash,rating,rating_tts,rating_irl,rating_combined,is_admin)
      VALUES ('Existing owner','existing owner','unchanged-hash',1234,1234,1150,1384,true) RETURNING *`);
    const { rows: [team] } = await pool.query(`INSERT INTO player_teams (name,name_key,slug,leader_user_id)
      VALUES ('Existing team','existing team','existing-team',$1) RETURNING *`, [user.id]);
    const { rows: [tournament] } = await pool.query(`INSERT INTO tournaments (owner_user_id,slug,status,format,swiss_round_count)
      VALUES ($1,'existing-tournament','draft','swiss',3) RETURNING *`, [user.id]);
    const { rows: [game] } = await pool.query(`INSERT INTO games (player_ids,status)
      VALUES ($1,'completed') RETURNING *`, [[user.id]]);
    const before = { users: [user], player_teams: [team], tournaments: [tournament], games: [game] };

    assert.deepEqual(await migrate(pool), MIGRATIONS.filter((item) => item.version > 21).map((item) => item.version));
    tournament.registration_limit = null;
    for (const [table, expected] of Object.entries(before)) {
      assert.deepEqual((await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows, expected, `${table} must be preserved without demo rows`);
    }
    const { rows } = await pool.query(`SELECT legacy_id AS id,name,description,emoji FROM achievements ORDER BY legacy_id`);
    assert.deepEqual(rows, catalog);
    const { rows: [counts] } = await pool.query(`SELECT
      (SELECT COUNT(*) FROM achievements WHERE category='title')::int AS titles,
      (SELECT COUNT(*) FROM achievement_awards)::int AS awards,
      (SELECT COUNT(*) FROM achievement_award_members)::int AS award_members,
      (SELECT COUNT(*) FROM tournament_table_images)::int AS table_images`);
    assert.deepEqual(counts, { titles: 17, awards: 0, award_members: 0, table_images: 0 });
    assert.deepEqual(await migrate(pool), []);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM achievements")).rows[0].count, 39);
  } finally {
    await pool.end();
  }
});
