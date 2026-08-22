const tournamentMatchesRepo = require("../db/repositories/tournament-matches");
const gameParticipantsRepo = require("../db/repositories/game-participants");
const {
  tournamentSummaryView,
  tournamentMatchView,
  tournamentParticipantView
} = require("./views");

function tournamentGameIds(games) {
  return games
    .filter((game) => game.sourceType === "tournament_match" && Number.isInteger(game.id))
    .map((game) => game.id);
}

async function attachTournamentGameDetails(client, games) {
  const gameIds = tournamentGameIds(games);
  const [links, gameParticipants] = await Promise.all([
    tournamentMatchesRepo.listByGameIds(client, gameIds),
    gameParticipantsRepo.listByGameIds(client, gameIds)
  ]);
  if (!links.length) return games;

  const byGameId = new Map(
    links
      .filter((link) => Number.isInteger(link.match?.gameId))
      .map((link) => [link.match.gameId, link])
  );
  const participantsByGameId = new Map();
  for (const participant of gameParticipants) {
    if (!participantsByGameId.has(participant.gameId)) participantsByGameId.set(participant.gameId, []);
    participantsByGameId.get(participant.gameId).push(participant);
  }

  return games.map((game) => {
    const link = byGameId.get(game.id);
    if (!link) return game;

    const participants = [link.participantA, link.participantB]
      .filter(Boolean)
      .map((participant) => tournamentParticipantView(participant));
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));
    const players = (participantsByGameId.get(game.id) || []).map((participant) => ({
      id: participant.resultKey,
      userId: participant.userId || null,
      name: participant.user?.name || participant.displayNameSnapshot || "Player",
      avatarData: participant.user?.avatarData || null,
      registerNickname: participant.user?.registerNickname || "",
      telegramContact: participant.user?.telegramContact || "",
      rating: participant.user?.rating ?? null,
      isAdmin: Boolean(participant.user?.isAdmin),
      createdAt: participant.user?.createdAt || null,
      faction: participant.factionSnapshot || "",
      tournamentParticipantId: participant.tournamentParticipantId || null,
      hasProfile: Boolean(participant.userId)
    }));

    return {
      ...game,
      players,
      tournament: tournamentSummaryView(link.tournament),
      tournamentMatch: tournamentMatchView(link.match, participantById)
    };
  });
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

module.exports = {
  attachTournamentGameDetails,
  sortGameViews
};
