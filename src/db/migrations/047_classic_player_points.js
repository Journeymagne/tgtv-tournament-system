const { teamPointsForMatch, teamStandings } = require("../../domain/team-tournaments");
const matchesRepo = require("../repositories/team-matches");
const rostersRepo = require("../repositories/team-rosters");
const tournamentsRepo = require("../repositories/tournaments");
const achievementsRepo = require("../repositories/achievements");

module.exports = {
  version: 47,
  name: "classic_player_points",
  async up(client) {
    const { rows } = await client.query(`
      SELECT DISTINCT tournament_id FROM tournament_team_matches
      WHERE pairing_type = 'sword_shield_classic'
      ORDER BY tournament_id
    `);
    for (const { tournament_id: id } of rows) {
      const tournament = await tournamentsRepo.lockById(client, id);
      const matches = await matchesRepo.listByTournament(client, id);
      for (const match of matches) {
        if (match.pairingType !== "sword_shield_classic" || match.phase !== "completed") continue;
        const points = teamPointsForMatch(match);
        await matchesRepo.update(client, match.id, {
          teamTournamentPointsA: points.a, teamTournamentPointsB: points.b
        });
      }
      // Published tables, roster places and podium awards use the same score.
      if (!tournament.finalResults?.length) continue;
      const rosters = (await rostersRepo.listByTournament(client, id, { includeWithdrawn: false }))
        .filter(roster => ["active", "finished"].includes(roster.status));
      const standings = teamStandings(rosters, matches, tournament.teamTiebreakerOrder ?? null);
      const finalResults = standings.map(({ roster, played, ...row }) => ({ ...row, rosterId: roster.id }));
      for (const row of standings) await rostersRepo.update(client, row.roster.id, { finalPlace: row.rank });
      const updated = await tournamentsRepo.update(client, id, { finalResults });
      await achievementsRepo.syncPodium(client, updated, tournament.ownerUserId);
    }
  }
};
