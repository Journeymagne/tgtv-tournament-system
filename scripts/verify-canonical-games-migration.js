const { getPool, closePool } = require("../src/db/pool");

const CHECKS = [
  {
    name: "playable tournament matches without a Game",
    sql: `SELECT COUNT(*)::int AS count
          FROM tournament_matches
          WHERE is_bye = FALSE
            AND status IN ('active', 'pending_confirmation', 'completed')
            AND participant_a_id IS NOT NULL
            AND participant_b_id IS NOT NULL
            AND game_id IS NULL`
  },
  {
    name: "tournament Games without a matching TournamentMatch link",
    sql: `SELECT COUNT(*)::int AS count
          FROM games g
          LEFT JOIN tournament_matches tm ON tm.game_id = g.id
          WHERE g.source_type = 'tournament_match'
            AND (tm.id IS NULL OR tm.id <> g.source_id)`
  },
  {
    name: "playable tournament Games without exactly two participant slots",
    sql: `SELECT COUNT(*)::int AS count
          FROM (
            SELECT g.id
            FROM tournament_matches tm
            JOIN games g ON g.id = tm.game_id
            LEFT JOIN game_participants gp ON gp.game_id = g.id
            WHERE tm.is_bye = FALSE
              AND tm.status IN ('active', 'pending_confirmation', 'completed')
            GROUP BY g.id
            HAVING COUNT(gp.id) <> 2
          ) invalid_games`
  },
  {
    name: "compatibility status mismatches",
    sql: `SELECT COUNT(*)::int AS count
          FROM tournament_matches tm
          JOIN games g ON g.id = tm.game_id
          WHERE tm.status IN ('active', 'pending_confirmation', 'completed')
            AND g.status <> CASE tm.status
            WHEN 'active' THEN 'open'
            ELSE tm.status
          END`
  },
  {
    name: "compatibility result mismatches",
    sql: `SELECT COUNT(*)::int AS count
          FROM tournament_matches tm
          JOIN games g ON g.id = tm.game_id
          WHERE g.result IS DISTINCT FROM tm.result
             OR g.pending_result IS DISTINCT FROM tm.pending_result
             OR g.elo IS DISTINCT FROM tm.elo`
  }
];

async function main() {
  const pool = getPool();
  const migration = await pool.query(
    "SELECT version, name, applied_at FROM schema_migrations WHERE version = 10"
  );
  if (!migration.rowCount) throw new Error("Migration 010 is not applied");

  let failed = false;
  console.log(`Migration 010 applied at ${migration.rows[0].applied_at.toISOString()}`);
  for (const check of CHECKS) {
    const { rows } = await pool.query(check.sql);
    const count = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const status = count === 0 ? "OK" : "FAIL";
    console.log(`${status}: ${check.name}: ${count}`);
    failed ||= count !== 0;
  }
  if (failed) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(closePool);
