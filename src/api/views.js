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

function userSummary({ user, hasAdmin, challenges, games, people }) {
  return {
    user: publicUser(user),
    hasAdmin,
    challenges: challenges.map((challenge) => challengeView(challenge, people)),
    games: games.map((game) => gameView(game, people))
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

module.exports = {
  publicUser,
  publicUserSummary,
  leaderboardUser,
  challengeView,
  gameView,
  feedbackView,
  challengeProgressView,
  userSummary,
  publicProfileSummary
};
