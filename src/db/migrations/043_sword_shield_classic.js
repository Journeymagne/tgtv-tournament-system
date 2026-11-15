module.exports = {
  version: 43,
  name: "sword_shield_classic",
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments
        ADD COLUMN captain_pairing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN team_tiebreaker_order TEXT[];
      ALTER TABLE tournaments DROP CONSTRAINT tournaments_pairing_type_check;
      ALTER TABLE tournaments ADD CONSTRAINT tournaments_pairing_type_check CHECK (
        (participant_mode = 'individual' AND pairing_type IS NULL) OR
        (participant_mode = 'team' AND pairing_type IN ('shield_sword', 'sword_shield_classic'))
      );
      ALTER TABLE tournament_team_matches
        ADD COLUMN pairing_type TEXT NOT NULL DEFAULT 'shield_sword',
        ADD COLUMN captain_pairing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN line_number INTEGER CHECK (line_number > 0);
      CREATE UNIQUE INDEX tournament_team_match_line ON tournament_team_matches(round_id, line_number)
        WHERE line_number IS NOT NULL;
    `);
  }
};
