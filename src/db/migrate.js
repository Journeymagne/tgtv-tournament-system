const { logError } = require("../http/logger");

const MIGRATIONS = [
  require("./migrations/001_baseline"),
  require("./migrations/002_kill_team_names"),
  require("./migrations/003_tournaments"),
  require("./migrations/004_tournament_creation_settings"),
  require("./migrations/005_tournament_tiebreakers"),
  require("./migrations/006_tournament_game_backfill"),
  require("./migrations/007_tournament_venue_tables"),
  require("./migrations/010_canonical_tournament_games")
].sort((a, b) => a.version - b.version);

const JOURNAL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

// A session-level lock serializes app instances during rolling production
// deploys. Without it two freshly started processes can both observe the same
// migration as missing and race to apply it.
const MIGRATION_LOCK_ID = 844_710_026;

async function appliedVersions(client) {
  const { rows } = await client.query("SELECT version FROM schema_migrations");
  return new Set(rows.map((row) => row.version));
}

async function migrate(pool) {
  const guard = await pool.connect();
  try {
    await guard.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await guard.query(JOURNAL);
    const done = await appliedVersions(guard);
    const applied = [];
    for (const migration of MIGRATIONS) {
      if (done.has(migration.version)) continue;
      try {
        await guard.query("BEGIN");
        await migration.up(guard);
        await guard.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [migration.version, migration.name]
        );
        await guard.query("COMMIT");
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
        await guard.query("ROLLBACK");
        logError(`migration ${migration.version} (${migration.name}) failed`, err);
        throw err;
      }
    }
    return applied;
  } finally {
    try {
      await guard.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } finally {
      guard.release();
    }
  }
}

module.exports = { migrate, MIGRATIONS };
