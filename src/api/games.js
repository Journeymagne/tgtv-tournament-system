const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const challengesRepo = require("../db/repositories/challenges");
const { calculateSubmittedResult, matchScoreFor } = require("../domain/scoring");
const { calculateElo, ELO_K } = require("../domain/elo");
const { gameView } = require("./views");
const { requirePositiveIntId } = require("./params");

const { ACTIVE_STATUSES } = gamesRepo;

async function lockGame(client, id) {
  // A malformed path id (e.g. "abc") never matched the old server.js route
  // regexes (/^\/api\/games\/(\d+)\/.../), so it fell through to the
  // router's own 404 "Route not found" instead of reaching a query. Validate
  // before locking so a bad id can't reach `FOR UPDATE` as NaN (Postgres
  // 22P02 -> the router's 500) -- same pattern as src/api/users.js and
  // src/api/challenges.js. This is also the A1 fix: the lock is the very
  // first query the handler issues.
  const gameId = requirePositiveIntId(id, 404, "Route not found");
  const game = await gamesRepo.lockById(client, gameId);
  if (!game) throw new HttpError(404, "Game not found");
  return game;
}

function requireParticipant(game, user, message) {
  if (!game.playerIds.includes(user.id)) throw new HttpError(403, message);
}

async function lockPlayers(client, game) {
  const players = await usersRepo.lockByIds(client, game.playerIds);
  const playerA = players.find((player) => player.id === game.playerIds[0]);
  const playerB = players.find((player) => player.id === game.playerIds[1]);
  if (!playerA || !playerB) {
    throw new HttpError(409, "One of the players has been deleted");
  }
  return { playerA, playerB, players };
}

async function viewOf(client, game) {
  const people = await usersRepo.findByIds(client, game.playerIds);
  return gameView(game, people);
}

async function applyElo(client, game, playerA, playerB, result, confirmedBy) {
  const matchScoreA = matchScoreFor(result, playerA.id, playerB.id);
  const { deltaA, deltaB } = calculateElo(playerA.rating, playerB.rating, matchScoreA);

  const updatedA = await usersRepo.addRating(client, playerA.id, deltaA);
  const updatedB = await usersRepo.addRating(client, playerB.id, deltaB);

  const elo = {
    k: ELO_K,
    [playerA.id]: { before: playerA.rating, after: updatedA.rating, delta: deltaA },
    [playerB.id]: { before: playerB.rating, after: updatedB.rating, delta: deltaB }
  };

  return gamesRepo.saveFinalResult(client, game.id, {
    result: { ...result, confirmedBy, confirmedAt: confirmedBy ? new Date().toISOString() : null },
    elo,
    submittedBy: game.submittedBy
  });
}

async function reverseElo(client, game) {
  if (!game.elo) return;
  for (const playerId of game.playerIds) {
    const delta = Number(game.elo?.[playerId]?.delta || 0);
    if (delta) await usersRepo.addRating(client, playerId, -delta);
  }
}

async function finalizeResult(client, game, confirmedBy) {
  if (game.status !== "pending_confirmation" || !game.pendingResult?.result) {
    throw new HttpError(409, "There is no submitted result to confirm");
  }
  const { playerA, playerB } = await lockPlayers(client, game);
  const pending = game.pendingResult.result;
  const normalized = calculateSubmittedResult(
    { scores: pending.scores, killzone: pending.killzone, tiebreakers: pending.tiebreakers },
    playerA.id,
    playerB.id
  );
  return applyElo(client, game, playerA, playerB, normalized, confirmedBy);
}

async function cancelGame(client, game) {
  const cancelled = await gamesRepo.cancel(client, game.id);
  if (game.challengeId) {
    const challenge = await challengesRepo.findById(client, game.challengeId);
    if (challenge && challenge.status === "accepted") {
      await challengesRepo.setStatus(client, challenge.id, "cancelled");
    }
  }
  return cancelled;
}

async function listCompleted({ client }) {
  const completed = await gamesRepo.listCompleted(client);
  const peopleIds = new Set();
  for (const game of completed) {
    for (const id of game.playerIds) peopleIds.add(id);
  }
  const people = await usersRepo.findByIds(client, [...peopleIds]);
  return { games: completed.map((game) => gameView(game, people)) };
}

async function submitResult({ client, user, params, body }) {
  const game = await lockGame(client, params.id);
  requireParticipant(game, user, "Only a game participant can submit the result");

  if (game.status === "completed") {
    throw new HttpError(409, "This game result has already been saved");
  }
  if (game.status === "cancelled") {
    throw new HttpError(409, "This game has been cancelled");
  }
  if (game.status === "pending_confirmation" && game.pendingResult?.submittedBy !== user.id) {
    throw new HttpError(409, "This result is waiting for your confirmation");
  }

  const { playerA, playerB } = await lockPlayers(client, game);
  const result = calculateSubmittedResult(body, playerA.id, playerB.id);
  const submittedAt = new Date().toISOString();

  const updated = await gamesRepo.savePendingResult(client, game.id, {
    submittedBy: user.id,
    pendingResult: { submittedBy: user.id, submittedAt, result }
  });

  return { game: await viewOf(client, updated) };
}

async function exitGame({ client, user, params }) {
  const game = await lockGame(client, params.id);
  requireParticipant(game, user, "Only a game participant can exit this game");

  if (!ACTIVE_STATUSES.includes(game.status)) {
    throw new HttpError(409, "Only open or pending games can be exited");
  }
  if (game.status === "pending_confirmation" && game.pendingResult?.submittedBy !== user.id) {
    throw new HttpError(403, "Only the player waiting for confirmation can delete this pending game");
  }

  const cancelled = await cancelGame(client, game);
  return { game: await viewOf(client, cancelled) };
}

async function respondToResult({ client, user, params }) {
  const game = await lockGame(client, params.id);
  requireParticipant(game, user, "Only a game participant can confirm the result");

  if (game.status !== "pending_confirmation" || !game.pendingResult?.result) {
    throw new HttpError(409, "There is no submitted result to confirm");
  }
  if (game.pendingResult.submittedBy === user.id) {
    throw new HttpError(403, "The other player must confirm this result");
  }

  if (params.action === "reject-result") {
    const cleared = await gamesRepo.clearResult(client, game.id);
    return { game: await viewOf(client, cleared) };
  }

  const finalized = await finalizeResult(client, game, user.id);
  return { game: await viewOf(client, finalized) };
}

module.exports = {
  listCompleted,
  submitResult,
  exitGame,
  respondToResult,
  finalizeResult,
  cancelGame,
  reverseElo,
  applyElo,
  lockGame,
  lockPlayers
};
