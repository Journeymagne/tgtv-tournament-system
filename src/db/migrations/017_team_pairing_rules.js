module.exports = {
  version: 17,
  name: "team_pairing_rules",
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS team_tables_locked BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE tournament_team_matches
        ADD COLUMN IF NOT EXISTS pairing_version INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS roll_history JSONB NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS mission_bans JSONB NOT NULL DEFAULT '[]';
      ALTER TABLE tournament_team_matches DROP CONSTRAINT IF EXISTS tournament_team_matches_phase_check;
      ALTER TABLE tournament_team_matches ADD CONSTRAINT tournament_team_matches_phase_check CHECK (
        phase IN ('awaiting_roll', 'mission_ban', 'shield_selection', 'sword_selection',
                  'environment_selection', 'in_progress', 'completed')
      );
    `);
  }
};
