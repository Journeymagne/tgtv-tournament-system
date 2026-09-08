module.exports = {
  version: 20,
  name: "team_roster_withdrawal",
  async up(client) {
    // Re-runnable, like every other migration here: the suite replays the whole
    // chain against an already-migrated database to prove a rerun cannot damage
    // live data, so a bare ADD COLUMN / ADD CONSTRAINT would fail on the second
    // pass. The named check constraint on `resolution` is spelled out rather
    // than left inline so the drop below can find it by name.
    await client.query(`
      ALTER TABLE tournament_team_matches ALTER COLUMN roster_b_id DROP NOT NULL;
      ALTER TABLE tournament_team_matches ADD COLUMN IF NOT EXISTS resolution TEXT;

      ALTER TABLE tournament_team_matches
        DROP CONSTRAINT IF EXISTS team_match_resolution_check;
      ALTER TABLE tournament_team_matches
        ADD CONSTRAINT team_match_resolution_check
        CHECK (resolution IS NULL OR resolution IN ('bye', 'forfeit'));

      ALTER TABLE tournament_team_matches
        DROP CONSTRAINT IF EXISTS team_match_bye_roster_check;
      ALTER TABLE tournament_team_matches
        ADD CONSTRAINT team_match_bye_roster_check
        CHECK ((resolution IS NOT DISTINCT FROM 'bye' AND roster_b_id IS NULL) OR
          (resolution IS DISTINCT FROM 'bye' AND roster_b_id IS NOT NULL));

      ALTER TABLE tournament_team_matches
        DROP CONSTRAINT IF EXISTS team_match_resolution_completed_check;
      ALTER TABLE tournament_team_matches
        ADD CONSTRAINT team_match_resolution_completed_check
        CHECK (resolution IS NULL OR phase = 'completed');
    `);
  }
};
