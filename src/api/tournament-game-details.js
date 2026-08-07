const tournamentMatchesRepo = require("../db/repositories/tournament-matches");
const {
  tournamentSummaryView,
  tournamentMatchView,
  tournamentParticipantView,
  tournamentMatchGameView
} = require("./views");

function tournamentGameIds(games) {
  return games
    .filter((game) => game.sourceType === "tournament_match" && Number.isInteger(game.id))
    .map((game) => game.id);
}

async function attachTournamentGameDetails(client, games) {
  const links = await tournamentMatchesRepo.listByGameIds(client, tournamentGameIds(games));
  if (!links.length) return games;

  const byGameId = new Map(
    links
      .filter((link) => Number.isInteger(link.match?.gameId))
      .map((link) => [link.match.gameId, link])
  );

  return games.map((game) => {
    const link = byGameId.get(game.id);
    if (!link) return game;

    const participants = [link.participantA, link.participantB]
      .filter(Boolean)
      .map((participant) => tournamentParticipantView(participant));
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));

    return {
      ...game,
      tournament: tournamentSummaryView(link.tournament),
      tournamentMatch: tournamentMatchView(link.match, participantById)
    };
  });
}

function collectSyntheticPeopleIds(items) {
  const ids = new Set();
  for (const item of items) {
    if (item.participantA?.userId) ids.add(item.participantA.userId);
    if (item.participantB?.userId) ids.add(item.participantB.userId);
  }
  return ids;
}

function sortGameViews(games) {
  return games.sort((a, b) => {
    const atCompare = String(b.submittedAt || b.createdAt || "").localeCompare(
      String(a.submittedAt || a.createdAt || "")
    );
    if (atCompare) return atCompare;
    return String(b.id).localeCompare(String(a.id));
  });
}

function syntheticTournamentMatchGames(items, people = []) {
  return items.map((item) => tournamentMatchGameView({ ...item, people }));
}

module.exports = {
  attachTournamentGameDetails,
  collectSyntheticPeopleIds,
  sortGameViews,
  syntheticTournamentMatchGames
};
