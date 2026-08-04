const { HttpError, ValidationError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const sessionsRepo = require("../db/repositories/sessions");
const gamesRepo = require("../db/repositories/games");
const games = require("./games");
const { publicUser, publicUserSummary, gameView, challengeProgressView } = require("./views");
const { requireInteger } = require("../domain/validation");
const { calculateSubmittedResult } = require("../domain/scoring");
const { hashPassword, generateTemporaryPassword } = require("../domain/passwords");
const { requirePositiveIntId } = require("./params");
const { recalculateCompletedGameRatings } = require("./rating-replay");
const { requireKillTeam, CLASSIFIED_TRACK, ALL_KILL_TEAM_TRACK, WILDCARDS } =
  require("../domain/kill-teams");

// D1 fix: server.js:1850 never checked game.status; "cancelled" is deliberately
// excluded so a cancelled game can no longer be "completed" for Elo.
const EDITABLE_GAME_STATUSES = ["open", "pending_confirmation", "completed"];

async function peopleForGames(client, list) {
  const ids = new Set();
  for (const game of list) {
    for (const id of game.playerIds) ids.add(id);
  }
  return usersRepo.findByIds(client, [...ids]);
}

async function requireTarget(client, id) {
  // A non-numeric id never matched server.js's /(\d+)/ regex -> "Route not found".
  const userId = requirePositiveIntId(id, 404, "Route not found");
  const target = await usersRepo.findById(client, userId);
  if (!target) throw new HttpError(404, "User not found");
  return target;
}

async function listActiveGames({ client }) {
  const active = await gamesRepo.listActive(client);
  const people = await peopleForGames(client, active);
  return { games: active.map((game) => gameView(game, people)) };
}

async function confirmGameResult({ client, user, params }) {
  const game = await games.lockGame(client, params.id);
  const finalized = await games.finalizeResult(client, game, user.id);
  const people = await usersRepo.findByIds(client, finalized.playerIds);
  return { game: gameView(finalized, people) };
}

async function deleteGame({ client, params }) {
  const game = await games.lockGame(client, params.id);
  if (!["open", "pending_confirmation"].includes(game.status)) {
    throw new HttpError(409, "Only active or pending games can be deleted here");
  }
  const cancelled = await games.cancelGame(client, game);
  const people = await usersRepo.findByIds(client, cancelled.playerIds);
  return { game: gameView(cancelled, people) };
}

async function saveGameResult({ client, user, params, body }) {
  const game = await games.lockGame(client, params.id);
  if (!EDITABLE_GAME_STATUSES.includes(game.status)) {
    throw new HttpError(409, "Only active, pending, or completed games can be edited");
  }

  const { playerA, playerB } = await games.lockPlayers(client, game);
  const result = calculateSubmittedResult(body, playerA.id, playerB.id);

  // Откатываем прежнее Elo и перечитываем рейтинги, чтобы посчитать дельту заново.
  await games.reverseElo(client, game);
  const refreshed = await usersRepo.findByIds(client, [playerA.id, playerB.id]);
  const beforeA = refreshed.find((person) => person.id === playerA.id);
  const beforeB = refreshed.find((person) => person.id === playerB.id);

  // Admin override is a new submission, not a confirmation, so bump submitted_at
  // and record the admin as the submitter.
  const updated = await games.applyElo(client, game, beforeA, beforeB, result, user.id, {
    newSubmission: true,
    submittedBy: user.id
  });
  await recalculateCompletedGameRatings(client);

  const replayed = await gamesRepo.findById(client, updated.id);
  const people = await usersRepo.findByIds(client, replayed.playerIds);
  return { game: gameView(replayed, people) };
}

async function listUsers({ client }) {
  const rows = await usersRepo.listWithGameCounts(client);
  return {
    users: rows.map((row) => ({ ...publicUserSummary(row), gamesPlayed: row.gamesPlayed }))
  };
}

async function updateUser({ client, user, params, body }) {
  const target = await requireTarget(client, params.id);

  // D2 fix: server.js:1958 wrote isAdmin before rejecting self-demotion, dropping
  // a bundled rating change. Validate the whole patch before writing anything.
  let rating = null;
  if (body.rating !== undefined) {
    rating = requireInteger(body.rating, {
      min: 0,
      max: 5000,
      message: "Rating must be an integer between 0 and 5000"
    });
  }

  let isAdmin = null;
  if (body.isAdmin !== undefined) {
    isAdmin = Boolean(body.isAdmin);
    if (target.id === user.id && !isAdmin) {
      throw new ValidationError("You cannot remove administrator rights from yourself");
    }
  }

  let updated = target;
  if (rating !== null) updated = await usersRepo.setRating(client, target.id, rating);
  if (isAdmin !== null) updated = await usersRepo.setAdmin(client, target.id, isAdmin);

  return { user: publicUser(updated) };
}

async function deleteUser({ client, user, params }) {
  const target = await requireTarget(client, params.id);
  if (target.id === user.id) throw new ValidationError("You cannot delete yourself");
  await usersRepo.remove(client, target.id);
  return { ok: true };
}

async function resetPassword({ client, user, params }) {
  const target = await requireTarget(client, params.id);
  if (target.id === user.id) {
    throw new ValidationError("You cannot reset your own password here");
  }

  const password = generateTemporaryPassword();
  const updated = await usersRepo.setPasswordHash(client, target.id, await hashPassword(password));
  await sessionsRepo.deleteByUserId(client, target.id);

  return { user: publicUser(updated), password };
}

async function challengeCredit({ client, user, params, body }) {
  const target = await requireTarget(client, params.id);
  const team = requireKillTeam(body.team);
  const trackKey = body.track === "allKillTeam" ? "allKillTeam" : "classified";
  const trackTeams = trackKey === "allKillTeam" ? ALL_KILL_TEAM_TRACK : CLASSIFIED_TRACK;

  if (!trackTeams.includes(team) && !WILDCARDS.includes(team)) {
    throw new ValidationError("Unknown Kill Team for this challenge");
  }

  async function progressFor(person) {
    const completed = await gamesRepo.listCompletedForUser(client, person.id);
    return challengeProgressView(completed, person);
  }

  if (body.action === "remove") {
    const updated = await usersRepo.appendChallengeCredit(client, target.id, {
      team,
      action: "deduct",
      deductedBy: user.id,
      deductedAt: new Date().toISOString()
    });
    return { progress: await progressFor(updated) };
  }

  const current = await progressFor(target);
  const track = current.tracks[trackKey];
  const alreadyDone =
    track.teams.find((item) => item.team === team)?.status === "completed" ||
    track.wildcards.find((item) => item.team === team)?.status === "completed";

  if (alreadyDone) return { progress: current };

  const updated = await usersRepo.appendChallengeCredit(client, target.id, {
    team,
    action: "credit",
    creditedBy: user.id,
    creditedAt: new Date().toISOString()
  });
  return { progress: await progressFor(updated) };
}

module.exports = {
  listActiveGames,
  confirmGameResult,
  deleteGame,
  saveGameResult,
  listUsers,
  updateUser,
  deleteUser,
  resetPassword,
  challengeCredit
};
