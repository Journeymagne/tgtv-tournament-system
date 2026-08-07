const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const tournamentMatchesRepo = require("../db/repositories/tournament-matches");
const { calculateElo, ELO_K } = require("../domain/elo");
const { matchScoreFor } = require("../domain/scoring");

function eloDeltaFor(game, userId) {
  return Number(game.elo?.[userId]?.delta || 0);
}

function inferBaseRatings(users, games) {
  const ratings = new Map(users.map((user) => [user.id, Number(user.rating || 0)]));
  for (const game of games) {
    for (const userId of game.playerIds || []) {
      if (!ratings.has(userId)) continue;
      ratings.set(userId, ratings.get(userId) - eloDeltaFor(game, userId));
    }
  }
  return ratings;
}

function isRankedGame(game, tournamentPolicies) {
  if (game.sourceType === "challenge") return true;
  if (game.sourceType === "tournament_match") {
    return tournamentPolicies.get(game.id) === "ranked";
  }
  return Boolean(game.elo);
}

function replayGame(game, ratings) {
  const [playerAId, playerBId] = game.playerIds || [];
  if (!Number.isInteger(playerAId) || !Number.isInteger(playerBId)) return null;
  if (!ratings.has(playerAId) || !ratings.has(playerBId)) return null;

  const beforeA = ratings.get(playerAId);
  const beforeB = ratings.get(playerBId);
  const matchScoreA = matchScoreFor(game.result, playerAId, playerBId);
  const { deltaA, deltaB } = calculateElo(beforeA, beforeB, matchScoreA);
  const afterA = beforeA + deltaA;
  const afterB = beforeB + deltaB;
  ratings.set(playerAId, afterA);
  ratings.set(playerBId, afterB);

  return {
    k: ELO_K,
    [playerAId]: { before: beforeA, after: afterA, delta: deltaA },
    [playerBId]: { before: beforeB, after: afterB, delta: deltaB }
  };
}

async function recalculateCompletedGameRatings(client) {
  const users = await usersRepo.listForRatingReplay(client);
  const games = await gamesRepo.listCompletedForRatingReplay(client);
  const tournamentGameIds = games
    .filter((game) => game.sourceType === "tournament_match")
    .map((game) => game.id);
  const tournamentPolicies = await tournamentMatchesRepo.ratingPoliciesByGameIds(client, tournamentGameIds);
  const ratings = inferBaseRatings(users, games);

  for (const game of games) {
    const elo = isRankedGame(game, tournamentPolicies) ? replayGame(game, ratings) : null;
    await gamesRepo.updateElo(client, game.id, elo);
  }

  for (const user of users) {
    const rating = ratings.get(user.id);
    if (Number.isInteger(rating) && rating !== user.rating) {
      await usersRepo.setRating(client, user.id, rating);
    }
  }

  await tournamentMatchesRepo.syncEloFromLinkedGames(client);
}

module.exports = { recalculateCompletedGameRatings };
