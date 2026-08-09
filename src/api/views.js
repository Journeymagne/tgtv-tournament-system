const { MAX_AVATAR_DATA_URL_LENGTH } = require("../config");
const { buildChallengeTracks } = require("../domain/challenge-progress");

function safeAvatar(value) {
  if (!value || value.length > MAX_AVATAR_DATA_URL_LENGTH) return null;
  return value;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    avatarData: safeAvatar(user.avatarData),
    registerNickname: user.registerNickname || "",
    telegramContact: user.telegramContact || "",
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

function publicUserSummary(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    registerNickname: user.registerNickname || "",
    telegramContact: user.telegramContact || "",
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin),
    createdAt: user.createdAt
  };
}

function leaderboardUser(user) {
  return {
    id: user.id,
    name: user.name,
    avatarData: safeAvatar(user.avatarData),
    rating: user.rating,
    isAdmin: Boolean(user.isAdmin)
  };
}

function findUser(people, id) {
  return people.find((person) => person.id === id) || null;
}

function challengeView(challenge, people) {
  return {
    ...challenge,
    from: publicUser(findUser(people, challenge.fromUserId)),
    to: publicUser(findUser(people, challenge.toUserId)),
    gameId: challenge.gameId || null
  };
}

function gameView(game, people) {
  if (Array.isArray(game.players) && game.players.length) {
    return { ...game, players: game.players };
  }

  return {
    ...game,
    players: (game.playerIds || [])
      .map((id) => findUser(people, id))
      .filter(Boolean)
      .map(publicUser)
  };
}

function feedbackView(item, people) {
  return {
    ...item,
    status: item.status || "open",
    user: publicUser(findUser(people, item.userId)),
    resolvedByUser: publicUser(findUser(people, item.resolvedBy))
  };
}

function challengeProgressView(games, user) {
  const view = publicUserSummary(user);
  const tracks = buildChallengeTracks(games, user);
  const classified = { user: view, ...tracks.classified };
  const allKillTeam = { user: view, ...tracks.allKillTeam };
  return { ...classified, tracks: { classified, allKillTeam } };
}

function userSummary({ user, hasAdmin, challenges, games, tournamentGames = [], people }) {
  return {
    user: publicUser(user),
    hasAdmin,
    challenges: challenges.map((challenge) => challengeView(challenge, people)),
    games: [...games.map((game) => gameView(game, people)), ...tournamentGames]
  };
}

function publicProfileSummary({
  user,
  completedGames,
  people,
  activeGame,
  pendingChallenge,
  adminPendingGames,
  allGamesForProgress
}) {
  const wins = completedGames.filter((game) => game.result?.winnerId === user.id).length;
  const draws = completedGames.filter((game) => game.result && !game.result.winnerId).length;
  const losses = completedGames.filter(
    (game) => game.result?.winnerId && game.result.winnerId !== user.id
  ).length;
  const eloDelta = completedGames.reduce(
    (sum, game) => sum + Number(game.elo?.[user.id]?.delta || 0),
    0
  );
  const winRate = completedGames.length
    ? Math.round((wins / completedGames.length) * 100)
    : 0;

  return {
    user: publicUser(user),
    stats: { matches: completedGames.length, wins, draws, losses, eloDelta, winRate },
    challengeProgress: challengeProgressView(allGamesForProgress, user),
    activeMatchup: {
      game: activeGame ? gameView(activeGame, people) : null,
      challenge: pendingChallenge ? challengeView(pendingChallenge, people) : null
    },
    pendingGames: adminPendingGames.map((game) => gameView(game, people)),
    recentGames: completedGames.slice(0, 5).map((game) => gameView(game, people))
  };
}

function tournamentParticipantView(participant, people = []) {
  const user = findUser(people, participant.userId);
  return {
    id: participant.id,
    tournamentId: participant.tournamentId,
    userId: participant.userId,
    user: user ? publicUser(user) : null,
    displayName: participant.displayName,
    faction: participant.faction || "",
    factionRules: participant.factionRules || "",
    seed: participant.seed,
    status: participant.status,
    source: participant.source,
    joinedAt: participant.joinedAt,
    withdrawnAt: participant.withdrawnAt,
    removedAt: participant.removedAt,
    placedAt: participant.placedAt
  };
}

function tournamentMatchView(match, participantById = new Map()) {
  return {
    id: match.id,
    tournamentId: match.tournamentId,
    roundId: match.roundId,
    roundNumber: match.roundNumber,
    bracketPosition: match.bracketPosition,
    status: match.status,
    isBye: match.isBye,
    participantAId: match.participantAId,
    participantBId: match.participantBId,
    participantA: participantById.get(match.participantAId) || null,
    participantB: participantById.get(match.participantBId) || null,
    sourceMatchAId: match.sourceMatchAId,
    sourceMatchBId: match.sourceMatchBId,
    winnerParticipantId: match.winnerParticipantId,
    pendingResult: match.pendingResult,
    result: match.result,
    matchPoints: match.matchPoints,
    elo: match.elo,
    gameId: match.gameId,
    tableId: match.tableId,
    table: match.table || null,
    mission: match.mission || null,
    completedAt: match.completedAt
  };
}

function tournamentRoundView(round, matches, participantById) {
  return {
    id: round.id,
    tournamentId: round.tournamentId,
    roundNumber: round.roundNumber,
    status: round.status,
    metadata: round.metadata,
    startedAt: round.startedAt,
    completedAt: round.completedAt,
    matches: matches
      .filter((match) => match.roundId === round.id)
      .map((match) => tournamentMatchView(match, participantById))
  };
}

function tournamentSummaryView(tournament) {
  return {
    id: tournament.id,
    ownerUserId: tournament.ownerUserId,
    slug: tournament.slug,
    name: tournament.name,
    description: tournament.description,
    gameSystem: tournament.gameSystem,
    startsAt: tournament.startsAt,
    rulesSummary: tournament.rulesSummary,
    rulesLink: tournament.rulesLink,
    status: tournament.status,
    format: tournament.format,
    swissRoundCount: tournament.swissRoundCount,
    singleEliminationSize: tournament.singleEliminationSize,
    tiebreakerOrder: tournament.tiebreakerOrder,
    ratingPolicy: tournament.ratingPolicy,
    challengeCreditPolicy: tournament.challengeCreditPolicy,
    seasonId: tournament.seasonId,
    venueMode: tournament.venueMode,
    finalResults: tournament.finalResults,
    participantCount: tournament.participantCount,
    roundCount: tournament.roundCount,
    publishedAt: tournament.publishedAt,
    startedAt: tournament.startedAt,
    completedAt: tournament.completedAt,
    cancelledAt: tournament.cancelledAt,
    createdAt: tournament.createdAt
  };
}

function tournamentParticipantPlayer(participant) {
  if (!participant) return null;
  const user = participant.user || null;
  return {
    id: participant.userId || -participant.id,
    name: participant.displayName || user?.name || "Player",
    rating: user?.rating || null,
    faction: participant.faction || "",
    tournamentParticipantId: participant.id,
    hasProfile: Boolean(participant.userId)
  };
}

function tournamentMatchGameView({ tournament, match, participantA, participantB, people = [] }) {
  const participantViews = [participantA, participantB].map((participant) =>
    tournamentParticipantView(participant, people)
  );
  const participantById = new Map(participantViews.map((participant) => [participant.id, participant]));
  const matchView = tournamentMatchView(match, participantById);
  const players = participantViews.map(tournamentParticipantPlayer).filter(Boolean);

  return {
    id: `tournament-match-${match.id}`,
    sourceType: "tournament_match",
    sourceId: match.id,
    status: match.status === "completed"
      ? "completed"
      : match.status === "pending_confirmation"
        ? "pending_confirmation"
        : "open",
    createdAt: match.createdAt,
    submittedBy: match.submittedByUserId,
    submittedAt: match.pendingResult?.submittedAt || match.completedAt || null,
    pendingResult: match.pendingResult,
    result: match.result,
    elo: match.elo,
    playerIds: players.filter((player) => player.hasProfile).map((player) => player.id),
    players,
    tournament: tournamentSummaryView(tournament),
    tournamentMatch: matchView
  };
}

function tournamentTableView(table) {
  return {
    id: table.id,
    tournamentId: table.tournamentId,
    tableNumber: table.tableNumber,
    killzone: table.killzone || "",
    deployment: table.deployment,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt
  };
}

function tournamentDetailView({
  tournament,
  participants = [],
  people = [],
  rounds = [],
  matches = [],
  tables = [],
  tournamentGames = [],
  standings = [],
  viewer = {},
  auditEvents = []
}) {
  const participantViews = participants.map((participant) =>
    tournamentParticipantView(participant, people)
  );
  const participantById = new Map(participantViews.map((participant) => [participant.id, participant]));
  const tableViews = tables.map(tournamentTableView);
  const tableById = new Map(tableViews.map((table) => [table.id, table]));
  const matchesWithTables = matches.map((match) => ({
    ...match,
    table: tableById.get(match.tableId) || null
  }));
  return {
    tournament: { ...tournamentSummaryView(tournament), viewer },
    participants: participantViews,
    tables: tableViews,
    rounds: rounds.map((round) => tournamentRoundView(round, matchesWithTables, participantById)),
    tournamentGames,
    standings: standings.map((row) => ({
      rank: row.rank,
      participantId: row.participant.id,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      matchPoints: row.matchPoints,
      byes: row.byes,
      strengthOfSchedule: row.strengthOfSchedule,
      buchholz: row.buchholz,
      totalVp: row.totalVp,
      vpDiff: row.vpDiff
    })),
    finalResults: tournament.finalResults || null,
    auditEvents
  };
}

module.exports = {
  publicUser,
  publicUserSummary,
  leaderboardUser,
  challengeView,
  gameView,
  feedbackView,
  challengeProgressView,
  userSummary,
  publicProfileSummary,
  tournamentSummaryView,
  tournamentDetailView,
  tournamentParticipantView,
  tournamentTableView,
  tournamentMatchGameView,
  tournamentMatchView,
  tournamentRoundView
};
