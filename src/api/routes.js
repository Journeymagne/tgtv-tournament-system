const auth = require("./auth");
const users = require("./users");
const challenges = require("./challenges");
const games = require("./games");
const feedback = require("./feedback");
const admin = require("./admin");

function withAction(handler, action) {
  return (ctx) => handler({ ...ctx, params: { ...ctx.params, action } });
}

module.exports = [
  { method: "GET", path: "/api/me", handler: auth.me, auth: "none", loadUser: true },
  { method: "PATCH", path: "/api/me", handler: auth.updateMe, auth: "user", tx: true },
  { method: "POST", path: "/api/register", handler: auth.register, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/setup-admin", handler: auth.setupAdmin, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/login", handler: auth.login, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/logout", handler: auth.logout, auth: "none", tx: true },

  { method: "GET", path: "/api/users", handler: users.list, auth: "none" },
  { method: "GET", path: "/api/users/search", handler: users.search, auth: "user" },
  { method: "GET", path: "/api/users/:id", handler: users.profile, auth: "user" },
  { method: "GET", path: "/api/challenge-progress", handler: users.challengeProgress, auth: "user" },

  { method: "GET", path: "/api/games", handler: games.listCompleted, auth: "user" },
  { method: "POST", path: "/api/games/:id/result", handler: games.submitResult, auth: "user", tx: true },
  { method: "POST", path: "/api/games/:id/exit", handler: games.exitGame, auth: "user", tx: true },
  {
    method: "POST",
    path: "/api/games/:id/confirm-result",
    handler: withAction(games.respondToResult, "confirm-result"),
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/games/:id/reject-result",
    handler: withAction(games.respondToResult, "reject-result"),
    auth: "user",
    tx: true
  },

  { method: "POST", path: "/api/challenges", handler: challenges.create, auth: "user", tx: true },
  {
    method: "GET",
    path: "/api/challenges/share/:token",
    handler: challenges.byShareToken,
    auth: "user"
  },
  {
    method: "POST",
    path: "/api/challenges/share/:token/accept",
    handler: challenges.acceptByShareToken,
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/challenges/:id/accept",
    handler: withAction(challenges.respond, "accept"),
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/challenges/:id/decline",
    handler: withAction(challenges.respond, "decline"),
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/challenges/:id/cancel",
    handler: withAction(challenges.respond, "cancel"),
    auth: "user",
    tx: true
  },

  { method: "POST", path: "/api/feedback", handler: feedback.create, auth: "user", tx: true },

  { method: "GET", path: "/api/admin/feedback", handler: feedback.list, auth: "admin" },
  {
    method: "PATCH",
    path: "/api/admin/feedback/:id",
    handler: feedback.updateStatus,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/feedback/:id",
    handler: feedback.remove,
    auth: "admin",
    tx: true
  },

  { method: "GET", path: "/api/admin/games", handler: admin.listActiveGames, auth: "admin" },
  {
    method: "POST",
    path: "/api/admin/games/:id/confirm-result",
    handler: admin.confirmGameResult,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/games/:id/result",
    handler: admin.saveGameResult,
    auth: "admin",
    tx: true
  },
  {
    method: "PATCH",
    path: "/api/admin/games/:id/result",
    handler: admin.saveGameResult,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/games/:id",
    handler: admin.deleteGame,
    auth: "admin",
    tx: true
  },

  { method: "GET", path: "/api/admin/users", handler: admin.listUsers, auth: "admin" },
  {
    method: "POST",
    path: "/api/admin/users/:id/challenge-credit",
    handler: admin.challengeCredit,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/users/:id/reset-password",
    handler: admin.resetPassword,
    auth: "admin",
    tx: true,
    rateLimit: "auth"
  },
  { method: "PATCH", path: "/api/admin/users/:id", handler: admin.updateUser, auth: "admin", tx: true },
  { method: "DELETE", path: "/api/admin/users/:id", handler: admin.deleteUser, auth: "admin", tx: true }
];
