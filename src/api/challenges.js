const crypto = require("node:crypto");

const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const challengesRepo = require("../db/repositories/challenges");
const { challengeView, gameView } = require("./views");
const { requirePositiveIntId } = require("./params");

function newShareToken() {
  return crypto.randomBytes(18).toString("hex");
}

async function peopleFor(client, challenge) {
  return usersRepo.findByIds(client, [challenge.fromUserId, challenge.toUserId]);
}

async function acceptChallenge(client, challenge) {
  const existingGame = await gamesRepo.findActiveBetween(
    client,
    challenge.fromUserId,
    challenge.toUserId
  );
  if (existingGame) {
    throw new HttpError(409, "These players already have an active game");
  }

  const game = await gamesRepo.insert(client, {
    challengeId: challenge.id,
    playerIds: [challenge.fromUserId, challenge.toUserId]
  });
  const updated = await challengesRepo.attachGame(client, challenge.id, game.id);
  return { game, challenge: updated };
}

async function create({ client, user, body }) {
  const toUserId = requirePositiveIntId(body.toUserId, 400, "Challenge target user not found");
  const target = await usersRepo.findById(client, toUserId);
  if (!target || target.id === user.id) {
    throw new HttpError(400, "Challenge target user not found");
  }

  const pending = await challengesRepo.findPendingBetween(client, user.id, target.id);
  if (pending) {
    throw new HttpError(409, "These players already have a pending challenge");
  }
  const activeGame = await gamesRepo.findActiveBetween(client, user.id, target.id);
  if (activeGame) {
    throw new HttpError(409, "These players already have an active game");
  }

  const challenge = await challengesRepo.insert(client, {
    fromUserId: user.id,
    toUserId: target.id,
    shareToken: newShareToken()
  });

  return {
    status: 201,
    body: { challenge: challengeView(challenge, [user, target]) }
  };
}

async function respond({ client, user, params }) {
  const id = requirePositiveIntId(params.id, 404, "Route not found");
  const challenge = await challengesRepo.lockById(client, id);
  if (!challenge) throw new HttpError(404, "Challenge not found");
  if (challenge.status !== "pending") {
    throw new HttpError(409, "This challenge has already been handled");
  }

  let updated;
  if (params.action === "cancel") {
    if (challenge.fromUserId !== user.id) {
      throw new HttpError(403, "Only the sender can cancel this challenge");
    }
    updated = await challengesRepo.setStatus(client, challenge.id, "cancelled");
  } else {
    if (challenge.toUserId !== user.id) {
      throw new HttpError(403, "Only the recipient can answer this challenge");
    }
    if (params.action === "decline") {
      updated = await challengesRepo.setStatus(client, challenge.id, "declined");
    } else {
      updated = (await acceptChallenge(client, challenge)).challenge;
    }
  }

  return { challenge: challengeView(updated, await peopleFor(client, updated)) };
}

async function loadShared(client, token, options) {
  const challenge = await challengesRepo.findByShareToken(client, token, options);
  if (!challenge) throw new HttpError(404, "Challenge link not found");
  return challenge;
}

async function byShareToken({ client, user, params }) {
  const challenge = await loadShared(client, params.token);
  if (challenge.fromUserId !== user.id && challenge.toUserId !== user.id) {
    throw new HttpError(403, "This challenge link is for another player");
  }
  return { challenge: challengeView(challenge, await peopleFor(client, challenge)) };
}

async function acceptByShareToken({ client, user, params }) {
  // Order matches server.js:1691-1706: status is checked before the
  // recipient check, and there is no separate "is this user a participant
  // at all" guard here (unlike byShareToken above) -- the recipient check
  // alone rejects both the sender and any stranger. So a non-participant
  // holding a valid token for an already-resolved challenge sees 409, not 403.
  const challenge = await loadShared(client, params.token, { forUpdate: true });
  if (challenge.status !== "pending") {
    throw new HttpError(409, "This challenge has already been handled");
  }
  if (challenge.toUserId !== user.id) {
    throw new HttpError(403, "Only the recipient can accept this challenge link");
  }

  const accepted = await acceptChallenge(client, challenge);
  const people = await peopleFor(client, accepted.challenge);

  return {
    challenge: challengeView(accepted.challenge, people),
    game: gameView(accepted.game, people)
  };
}

module.exports = { create, respond, byShareToken, acceptByShareToken, acceptChallenge };
