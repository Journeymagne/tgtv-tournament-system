const tournaments = require("../repositories/tournaments");
const participants = require("../repositories/tournament-participants");
const matches = require("../repositories/tournament-matches");
const audit = require("../repositories/tournament-audit-events");
const { winnerParticipantIdFromResult } = require("../../domain/tournaments/results");
const { buildStandings } = require("../../domain/tournaments/standings");

// Restrict the repair to unambiguous account/guest result keys. Deleted accounts
// or older, unresolvable results retain their existing historical metadata.
const AFFECTED = `
  SELECT DISTINCT m.tournament_id
  FROM tournament_matches m
  JOIN tournaments t ON t.id = m.tournament_id
  JOIN tournament_participants a ON a.id = m.participant_a_id
  JOIN tournament_participants b ON b.id = m.participant_b_id
  WHERE t.participant_mode = 'individual'
    AND m.status = 'completed' AND NOT m.is_bye
    AND (
      (m.result->>'winnerId' = COALESCE(a.user_id, -a.id)::text
       AND m.winner_participant_id IS DISTINCT FROM a.id)
      OR (m.result->>'winnerId' = COALESCE(b.user_id, -b.id)::text
       AND m.winner_participant_id IS DISTINCT FROM b.id)
    )
  ORDER BY m.tournament_id
`;

const STAT_FIELDS = [
  "matchPoints", "wins", "draws", "losses", "byes", "totalVp", "vpDiff",
  "strengthOfSchedule", "buchholz", "headToHeadWins"
];

module.exports = {
  version: 34,
  name: "tournament_winner_identity",
  async up(client) {
    const { rows: affected } = await client.query(AFFECTED);
    for (const { tournament_id: tournamentId } of affected) {
      // Match the application's tournament -> match lock order.
      const tournament = await tournaments.lockById(client, tournamentId);
      await client.query("SELECT id FROM tournament_matches WHERE tournament_id = $1 FOR UPDATE", [tournamentId]);
      const entrants = await participants.listByTournament(client, tournamentId);
      const byId = new Map(entrants.map((participant) => [participant.id, participant]));
      const tournamentMatches = await matches.listByTournament(client, tournamentId);
      let repaired = false;
      for (const match of tournamentMatches) {
        if (match.status !== "completed" || match.isBye || !match.result?.winnerId) continue;
        const a = byId.get(match.participantAId);
        const b = byId.get(match.participantBId);
        if (!a || !b) continue;
        const key = Number(match.result.winnerId);
        if (![a.userId || -a.id, b.userId || -b.id].includes(key)) continue;
        const winnerParticipantId = winnerParticipantIdFromResult(match.result, a, b);
        if (match.winnerParticipantId === winnerParticipantId) continue;
        const before = { winnerParticipantId: match.winnerParticipantId, matchPoints: match.matchPoints };
        const after = {
          winnerParticipantId,
          matchPoints: { [a.id]: winnerParticipantId === a.id ? 3 : 0, [b.id]: winnerParticipantId === b.id ? 3 : 0 }
        };
        await matches.update(client, match.id, after);
        await audit.insert(client, {
          tournamentId, eventType: "winner_identity_repaired", entityType: "match", entityId: match.id,
          before, after,
          metadata: { migration: 34, gameId: match.gameId, reviewBracket: tournament.format === "single_elimination" }
        });
        Object.assign(match, after);
        repaired = true;
      }
      if (!repaired || !Array.isArray(tournament.finalResults)) continue;
      const standings = buildStandings(entrants, tournamentMatches, tournament.tiebreakerOrder);
      const standingsById = new Map(standings.map((row) => [row.participant.id, row]));
      // Published places are an explicit organizer decision. Repair all derived
      // statistics (including opponents' tiebreakers), preserving places/awards.
      const finalResults = tournament.finalResults.map((row) => {
        const standing = standingsById.get(row.participantId);
        return standing ? { ...row, ...Object.fromEntries(STAT_FIELDS.map((key) => [key, standing[key]])) } : row;
      });
      await tournaments.update(client, tournamentId, { finalResults });
      await audit.insert(client, {
        tournamentId, eventType: "final_statistics_repaired", entityType: "tournament", entityId: tournamentId,
        before: { finalResults: tournament.finalResults }, after: { finalResults },
        metadata: { migration: 34, publishedPlacesPreserved: true, reviewStandings: true }
      });
    }
  }
};
