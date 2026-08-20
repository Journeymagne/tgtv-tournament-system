const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const tournamentMatchesRepo = require("../db/repositories/tournament-matches");
const { calculateElo, ELO_K } = require("../domain/elo");
const { matchScoreFor } = require("../domain/scoring");

const UNREGISTERED_OPPONENT_RATING_BONUS = 15;

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
    return game.tournament?.ratingPolicy === "ranked" || tournamentPolicies.get(game.id) === "ranked";
  }
  return Boolean(game.elo);
}

function replayGame(game, ratings) {
  const playerIds = (game.playerIds || []).filter(Number.isInteger);
  if (game.sourceType === "tournament_match" && playerIds.length === 1) {
    const [playerId] = playerIds;
    if (!ratings.has(playerId)) return null;
    const before = ratings.get(playerId);
    const after = before + UNREGISTERED_OPPONENT_RATING_BONUS;
    ratings.set(playerId, after);
    return {
      flat: UNREGISTERED_OPPONENT_RATING_BONUS,
      [playerId]: { before, after, delta: UNREGISTERED_OPPONENT_RATING_BONUS }
    };
  }

  const [playerAId, playerBId] = playerIds;
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

function unlinkedTournamentRatingGame(item) {
  return {
    id: `tournament-match-${item.match.id}`,
    sourceType: "tournament_match",
    playerIds: [item.participantA?.userId, item.participantB?.userId].filter(Number.isInteger),
    result: item.match.result,
    elo: item.match.elo,
    submittedAt: item.match.completedAt,
    createdAt: item.match.createdAt,
    tournament: item.tournament,
    ratingReplayMatchId: item.match.id
  };
}

function ratingReplayOrder(a, b) {
  const timestamp = String(a.submittedAt || a.createdAt || "").localeCompare(
    String(b.submittedAt || b.createdAt || "")
  );
  if (timestamp) return timestamp;
  return String(a.id).localeCompare(String(b.id));
}

async function recalculateCompletedGameRatings(client) {
  const users = await usersRepo.listForRatingReplay(client);
  const games = await gamesRepo.listCompletedForRatingReplay(client);
  const unlinkedTournamentGames = (await tournamentMatchesRepo.listCompletedUnlinked(client))
    .map(unlinkedTournamentRatingGame);
  const replayGames = [...games, ...unlinkedTournamentGames].sort(ratingReplayOrder);
  const tournamentGameIds = games
    .filter((game) => game.sourceType === "tournament_match")
    .map((game) => game.id);
  const tournamentPolicies = await tournamentMatchesRepo.ratingPoliciesByGameIds(client, tournamentGameIds);
  const ratings = inferBaseRatings(users, replayGames);

  for (const game of replayGames) {
    const elo = isRankedGame(game, tournamentPolicies) ? replayGame(game, ratings) : null;
    if (game.ratingReplayMatchId) {
      await tournamentMatchesRepo.update(client, game.ratingReplayMatchId, { elo });
    } else {
      await gamesRepo.updateElo(client, game.id, elo);
    }
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
