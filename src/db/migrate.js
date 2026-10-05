const { logError } = require("../http/logger");

const MIGRATIONS = [
  require("./migrations/001_baseline"),
  require("./migrations/002_kill_team_names"),
  require("./migrations/003_tournaments"),
  require("./migrations/004_tournament_creation_settings"),
  require("./migrations/005_tournament_tiebreakers"),
  require("./migrations/006_tournament_game_backfill"),
  require("./migrations/007_tournament_venue_tables"),
  require("./migrations/010_canonical_tournament_games"),
  require("./migrations/011_tournament_round_draft"),
  require("./migrations/012_venue_ratings"),
  require("./migrations/013_player_teams"),
  require("./migrations/014_tournament_default_season"),
  require("./migrations/015_combined_rating"),
  require("./migrations/016_notification_inbox"),
  require("./migrations/017_team_pairing_rules"),
  require("./migrations/018_documentation"),
  require("./migrations/019_tournament_logo"),
  require("./migrations/020_team_roster_withdrawal"),
  require("./migrations/021_avatar_version"),
  require("./migrations/022_team_pairing_history"),
  require("./migrations/023_achievements"),
  require("./migrations/024_legacy_achievements"),
  require("./migrations/025_tournament_table_images"),
  require("./migrations/026_achievement_titles"),
  require("./migrations/027_achievement_text_edits"),
  require("./migrations/028_tournament_registration"),
  require("./migrations/029_notification_history"),
  require("./migrations/030_tournament_live"),
  require("./migrations/031_guest_rating_docs"),
  require("./migrations/032_studio_projects"),
  require("./migrations/033_studio_project_deletion"),
  require("./migrations/034_tournament_winner_identity"),
  require("./migrations/035_tournament_identity_guards"),
  require("./migrations/036_studio_tts_exports"),
  require("./migrations/037_access_roles"),
  require("./migrations/038_journey_platform_owner"),
  require("./migrations/039_studio_reviews"),
  require("./migrations/040_studio_review_versions"),
  require("./migrations/041_studio_comments"),
  require("./migrations/042_email_accounts"),
  require("./migrations/043_sword_shield_classic"),
  require("./migrations/044_solo_replacements"),
  require("./migrations/045_classic_three_points"),
  require("./migrations/046_team_roster_proxies"),
  require("./migrations/047_classic_player_points"),
  require("./migrations/048_community_faq"),
  require("./migrations/049_faq_info"),
  require("./migrations/050_faq_comment_edits")
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
