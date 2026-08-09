const { logError } = require("../http/logger");

const MIGRATIONS = [
  require("./migrations/001_baseline"),
  require("./migrations/002_kill_team_names"),
  require("./migrations/003_tournaments"),
  require("./migrations/004_tournament_creation_settings"),
  require("./migrations/005_tournament_tiebreakers"),
  require("./migrations/006_tournament_game_backfill"),
  require("./migrations/007_tournament_venue_tables")
].sort((a, b) => a.version - b.version);

const JOURNAL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

async function appliedVersions(client) {
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((row) => row.version));
}

async function migrate(pool) {
  const setup = await pool.connect();
  try {
    await setup.query(JOURNAL);
  } finally {
    setup.release();
  }

  const listClient = await pool.connect();
  let done;
  try {
    done = await appliedVersions(listClient);
  } finally {
    listClient.release();
  }

  const applied = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await migration.up(client);
      await client.query(
        "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
        [migration.version, migration.name]
      );
      await client.query("COMMIT");
      applied.push(migration.version);
      console.log(
        JSON.stringify({
          level: "info",
          time: new Date().toISOString(),
          msg: "migration applied",
          version: migration.version,
          name: migration.name
        })
      );
    } catch (err) {
      await client.query("ROLLBACK");
      logError(`migration ${migration.version} (${migration.name}) failed`, err);
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

module.exports = { migrate, MIGRATIONS };
