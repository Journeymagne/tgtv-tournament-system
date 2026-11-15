module.exports = {
  version: 70,
  name: "tournament_round_cascade",
  async up(client) {
    // The original round_id FK cascades, but migration 035 added a second
    // round/tournament FK with NO ACTION. After a restore its check can run
    // before the original cascade and block prepared-round replacement.
    // Both references must agree on deletion while retaining tournament scope.
    await client.query(`
      ALTER TABLE tournaments.tournament_matches
        DROP CONSTRAINT tournament_match_round_scope,
        ADD CONSTRAINT tournament_match_round_scope
          FOREIGN KEY (round_id, tournament_id)
          REFERENCES tournaments.tournament_rounds(id, tournament_id)
          ON DELETE CASCADE NOT VALID
    `);
  }
};
