module.exports = {
  version:111,
  name:'wtc_doubles',
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments DROP CONSTRAINT tournaments_team_mode_check;
      ALTER TABLE tournaments DROP CONSTRAINT tournaments_pairing_type_check;
      ALTER TABLE tournaments ADD CONSTRAINT tournaments_pairing_type_check CHECK (
        (participant_mode = 'individual' AND pairing_type IS NULL) OR
        (participant_mode = 'team' AND pairing_type IN ('shield_sword','sword_shield_classic','doubles','wtc_doubles'))
      );
      ALTER TABLE tournaments ADD CONSTRAINT tournaments_team_mode_check CHECK (
        participant_mode <> 'team' OR (format = 'swiss' AND (
          (pairing_type = 'doubles' AND team_size = 2 AND venue_mode = 'irl' AND captain_pairing_enabled = FALSE) OR
          (pairing_type = 'wtc_doubles' AND team_size = 2 AND faction_count = 1 AND
            team_tiebreaker_order IS NULL AND captain_pairing_enabled = (venue_mode = 'tts')) OR
          (pairing_type IN ('shield_sword','sword_shield_classic') AND team_size = 3)
        ))
      );
      ALTER TABLE tournament_team_matches DROP CONSTRAINT team_match_size_check;
      ALTER TABLE tournament_team_matches ADD CONSTRAINT team_match_size_check CHECK (
        (pairing_type = 'doubles' AND team_size = 2 AND captain_pairing_enabled = FALSE AND resolution IS NULL) OR
        (pairing_type = 'wtc_doubles' AND team_size = 2 AND resolution IS NULL) OR
        (pairing_type IN ('shield_sword','sword_shield_classic') AND team_size = 3)
      );
    `);
  }
};
