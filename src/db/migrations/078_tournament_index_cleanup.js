module.exports = {
  version: 78,
  name: "tournament_index_cleanup",
  async up(client) {
    // Each retained UNIQUE B-tree covers the removed index's leading columns:
    // rounds(tournament_id, round_number), tables(tournament_id, table_number),
    // team matches(round_id, bracket_position), game links(team_match_id, slot).
    // Keep the constraint indexes: they enforce uniqueness as well as serve reads.
    await client.query(`
      DROP INDEX IF EXISTS tournaments.idx_tournament_rounds_tournament_id;
      DROP INDEX IF EXISTS tournaments.idx_tournament_tables_tournament_id;
      DROP INDEX IF EXISTS tournaments.idx_tournament_team_matches_round;
      DROP INDEX IF EXISTS tournaments.idx_tournament_team_match_games_match;
    `);
  }
};
