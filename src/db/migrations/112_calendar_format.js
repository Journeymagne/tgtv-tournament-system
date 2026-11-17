module.exports = {
  version:112,name:'calendar_format',
  async up(client) {
    await client.query(`ALTER TABLE tournaments.calendar_events
      ADD COLUMN swiss_round_count INTEGER NOT NULL DEFAULT 3 CHECK(swiss_round_count>=1),
      ADD COLUMN team_size INTEGER;
      UPDATE tournaments.calendar_events SET team_size=CASE tournament_type WHEN 'pairs' THEN 2 WHEN 'teams' THEN 3 ELSE NULL END;
      UPDATE tournaments.calendar_events e SET swiss_round_count=t.swiss_round_count
        FROM tournaments.tournaments t WHERE t.id=e.tournament_id AND t.swiss_round_count IS NOT NULL;
      ALTER TABLE tournaments.calendar_events ADD CONSTRAINT calendar_event_team_size_matches_type CHECK(
        (tournament_type='solo' AND team_size IS NULL) OR
        (tournament_type='pairs' AND team_size IS NOT NULL AND team_size=2) OR
        (tournament_type='teams' AND team_size IS NOT NULL AND team_size=3)
      );`);
  }
};
