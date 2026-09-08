const { HttpError } = require("../http/io");
const usersRepo = require("../db/repositories/users");
const gamesRepo = require("../db/repositories/games");
const challengesRepo = require("../db/repositories/challenges");
const playerTeamsRepo = require("../db/repositories/player-teams");
const {
  leaderboardUser,
  publicUserSummary,
  challengeProgressView,
  publicProfileSummary
} = require("./views");
const {
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS
} = require("../domain/kill-teams");
const { requirePositiveIntId } = require("./params");
const { decodeDataUrl, contentVersion } = require("../domain/data-url");
const {
  attachTournamentGameDetails,
  sortGameViews
} = require("./tournament-game-details");

const SEARCH_LIMIT = 10;

async function list({ client, query = new URLSearchParams() }) {
  const requestedMode = query.get("venue");
  const ratingMode = ["combined", "tts", "irl"].includes(requestedMode) ? requestedMode : "combined";
  const rows = await usersRepo.listLeaderboard(client, ratingMode);
  return { users: rows.map(leaderboardUser) };
}

// The picture, served as a file. Public because the leaderboard is: the same
// avatars are already visible to anyone who can load the player list.
async function avatar({ client, params, req }) {
  const id = requirePositiveIntId(params.id, 404, "Player not found");
  const stored = await usersRepo.readAvatar(client, id);
  const file = stored ? decodeDataUrl(stored) : null;
  if (!file) throw new HttpError(404, "This player has no avatar");
  const etag = `"${contentVersion(stored)}"`;
  const headers = {
    ETag: etag,
    // A versioned request names one exact image, so it can be cached forever;
    // the bare URL has to stay revalidatable.
    "Cache-Control": req?.url?.includes("v=")
      ? "public, max-age=604800, immutable"
      : "public, max-age=0, must-revalidate"
  };
  if (req?.headers?.["if-none-match"] === etag) return { status: 304, buffer: null, headers };
  return { buffer: file.bytes, contentType: file.contentType, headers };
}

async function search({ client, user, query }) {
  const q = String(query.get("q") || "").trim().replace(/\s+/g, " ");
  const found = await usersRepo.search(client, {
    q,
    excludeId: user.id,
    limit: SEARCH_LIMIT
  });
  return { users: found.map(publicUserSummary) };
}

async function requireUser(client, id) {
  const found = await usersRepo.findById(client, id);
  if (!found) throw new HttpError(404, "User not found");
  return found;
}

async function profile({ client, user, params }) {
  // A malformed path id (e.g. "abc") never matched the old server.js route
  // regex, so it fell through to the router's own 404 "Route not found".
  // Mirror that here instead of letting NaN reach the parameterized query.
  const targetId = requirePositiveIntId(params.id, 404, "Route not found");
  const target = await requireUser(client, targetId);
  const isSelf = target.id === user.id;

  const completedGames = await attachTournamentGameDetails(
    client,
    await gamesRepo.listCompletedForUser(client, target.id)
  );
  const activeGame = isSelf ? null : await gamesRepo.findActiveBetween(client, user.id, target.id);
  const pendingChallenge = isSelf
    ? null
    : await challengesRepo.findPendingBetween(client, user.id, target.id);
  const adminPendingGames = user.isAdmin
    ? await attachTournamentGameDetails(client, await gamesRepo.listPendingForUser(client, target.id))
    : [];
  const playerTeams = await playerTeamsRepo.listForUser(client, target.id);

  const peopleIds = new Set([target.id, user.id]);
  for (const game of [...completedGames, ...adminPendingGames]) {
    for (const id of game.playerIds) peopleIds.add(id);
  }
  if (activeGame) for (const id of activeGame.playerIds) peopleIds.add(id);
  if (pendingChallenge) {
    peopleIds.add(pendingChallenge.fromUserId);
    peopleIds.add(pendingChallenge.toUserId);
  }
  const people = await usersRepo.findByIds(client, [...peopleIds]);
  const allCompletedGames = sortGameViews(completedGames);

  return {
    ...publicProfileSummary({
    user: target,
    completedGames: allCompletedGames,
    people,
    activeGame,
    pendingChallenge,
    adminPendingGames,
    allGamesForProgress: allCompletedGames
    }),
    playerTeams: playerTeams.map((team) => ({
      id: team.id,
      slug: team.slug,
      name: team.name,
      logoData: team.logoData,
      archivedAt: team.archivedAt
    }))
  };
}

async function challengeProgress({ client, user, query }) {
  // `userId` is a query parameter, not a path segment, so a malformed value
  // never falls into the router's "route not found" case the way a bad
  // path id does. server.js resolved it to "User not found" (the same 404
  // a valid-but-unknown id gets) -- reproduce that instead of letting NaN
  // reach the parameterized query.
  const raw = query.get("userId");
  const requestedId = raw ? requirePositiveIntId(raw, 404, "User not found") : user.id;
  const target = await requireUser(client, requestedId);
  const completedGames = await gamesRepo.listCompletedForUser(client, target.id);

  return {
    teams: CLASSIFIED_TRACK,
    wildcards: WILDCARDS,
    allKillTeamTeams: ALL_KILL_TEAM_TRACK,
    users: [
      challengeProgressView(
        sortGameViews(completedGames),
        target
      )
    ]
  };
}

module.exports = { list, avatar, search, profile, challengeProgress };
