module.exports = {
  version: 45,
  name: "classic_three_points",
  async up(client) {
    // Published tournament results remain a historical snapshot of their rules.
    await client.query(`
      UPDATE tournament_team_matches AS m
      SET team_tournament_points_a = CASE WHEN m.team_tournament_points_a = 2 THEN 3 ELSE m.team_tournament_points_a END,
          team_tournament_points_b = CASE WHEN m.team_tournament_points_b = 2 THEN 3 ELSE m.team_tournament_points_b END,
          updated_at = NOW()
      FROM tournaments AS t
      WHERE t.id = m.tournament_id
        AND t.status NOT IN ('completed', 'cancelled')
        AND m.pairing_type = 'sword_shield_classic'
        AND (m.team_tournament_points_a = 2 OR m.team_tournament_points_b = 2)
    `);
  }
};
