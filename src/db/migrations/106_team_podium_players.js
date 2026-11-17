module.exports = {
  version: 106,
  name: "team_podium_players",
  async up(client) {
    await client.query(`ALTER TABLE tournaments.achievements
      DROP CONSTRAINT IF EXISTS achievements_tournament_id_place_key;
      CREATE UNIQUE INDEX IF NOT EXISTS achievements_tournament_place_kind
        ON tournaments.achievements(tournament_id, place, kind);`);

    // Only published team results are reconciled. Never recalculate standings or ratings.
    const { rows } = await client.query(`SELECT id FROM tournaments.tournaments
      WHERE status='completed' AND participant_mode='team'
        AND jsonb_array_length(COALESCE(final_results,'[]'::jsonb)) > 0
      ORDER BY id FOR UPDATE`);
    const tournaments = require('../repositories/tournaments');
    const { syncPodium } = require('../repositories/achievements');
    for (const row of rows) {
      const tournament = await tournaments.findById(client, row.id);
      await syncPodium(client, tournament, tournament.ownerUserId);
    }
  }
};
