const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const tournamentMatchesRepo = require("../db/repositories/tournament-matches");
const { calculateElo, ELO_K } = require("../domain/elo");
const { matchScoreFor } = require("../domain/scoring");

const UNREGISTERED_OPPONENT_RATING_BONUS = 15;

function eloDeltaFor(game, userId, mode) {
  const track = mode === "combined" ? game.elo?.combined : game.elo;
  return Number(track?.[userId]?.delta || 0);
}

function inferBaseRatings(
  users,
  games,
  { splitFromLegacyRating = false, includeCombined = true, resetCombined = false } = {}
) {
  const ratings = {
    tts: new Map(),
    irl: new Map()
  };
  if (includeCombined) ratings.combined = new Map();
  for (const user of users) {
    if (splitFromLegacyRating) {
      ratings.tts.set(user.id, Number(user.rating || 0));
      ratings.irl.set(user.id, Number(user.rating || 0));
    } else {
      ratings.tts.set(user.id, usersRepo.ratingForVenue(user, "tts"));
      ratings.irl.set(user.id, usersRepo.ratingForVenue(user, "irl"));
    }
    if (includeCombined) {
      ratings.combined.set(
        user.id,
        resetCombined ? 1000 : usersRepo.ratingForVenue(user, "combined")
      );
    }
  }
  for (const game of games) {
    const venue = splitFromLegacyRating ? null : usersRepo.normalizeVenueMode(game.venueMode);
    for (const userId of game.playerIds || []) {
      const delta = eloDeltaFor(game, userId, venue);
      const tracks = venue ? [ratings[venue]] : [ratings.tts, ratings.irl];
      for (const track of tracks) {
        if (!track.has(userId)) continue;
        track.set(userId, track.get(userId) - delta);
      }
      if (includeCombined && !resetCombined && ratings.combined.has(userId)) {
        ratings.combined.set(
          userId,
          ratings.combined.get(userId) - eloDeltaFor(game, userId, "combined")
        );
      }
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

function ratingReplayOrder(a, b) {
  const timestamp = String(a.submittedAt || a.createdAt || "").localeCompare(
    String(b.submittedAt || b.createdAt || "")
  );
  if (timestamp) return timestamp;
  return String(a.id).localeCompare(String(b.id));
}

async function recalculateCompletedGameRatings(client, options = {}) {
  const includeCombined = options.includeCombined !== false;
  const users = await usersRepo.listForRatingReplay(client, { includeCombined });
  const games = await gamesRepo.listCompletedForRatingReplay(client);
  const replayGames = games.sort(ratingReplayOrder);
  const tournamentGameIds = games
    .filter((game) => game.sourceType === "tournament_match")
    .map((game) => game.id);
  const tournamentPolicies = await tournamentMatchesRepo.ratingPoliciesByGameIds(client, tournamentGameIds);
  const ratings = inferBaseRatings(users, replayGames, options);

  for (const game of replayGames) {
    const venue = usersRepo.normalizeVenueMode(game.venueMode);
    const ranked = isRankedGame(game, tournamentPolicies);
    const venueElo = ranked ? replayGame(game, ratings[venue]) : null;
    const combinedElo = includeCombined && ranked ? replayGame(game, ratings.combined) : null;
    const elo = venueElo && includeCombined ? { ...venueElo, combined: combinedElo } : venueElo;
    await gamesRepo.updateElo(client, game.id, elo);
  }

  for (const user of users) {
    const next = {
      tts: ratings.tts.get(user.id),
      irl: ratings.irl.get(user.id),
      ...(includeCombined ? { combined: ratings.combined.get(user.id) } : {})
    };
    if (
      Number.isInteger(next.tts) &&
      Number.isInteger(next.irl) &&
      (!includeCombined || Number.isInteger(next.combined)) &&
      (
        next.tts !== usersRepo.ratingForVenue(user, "tts") ||
        next.irl !== usersRepo.ratingForVenue(user, "irl") ||
        (includeCombined && next.combined !== usersRepo.ratingForVenue(user, "combined"))
      )
    ) {
      await usersRepo.setRatings(client, user.id, next);
    }
  }

  await tournamentMatchesRepo.syncEloFromLinkedGames(client);
}

module.exports = { recalculateCompletedGameRatings };
