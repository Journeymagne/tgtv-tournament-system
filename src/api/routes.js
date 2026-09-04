const auth = require("./auth");
const users = require("./users");
const challenges = require("./challenges");
const games = require("./games");
const feedback = require("./feedback");
const admin = require("./admin");
const tournaments = require("./tournaments");
const playerTeams = require("./player-teams");
const teamTournaments = require("./team-tournaments");

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

  { method: "GET", path: "/api/teams", handler: playerTeams.list, auth: "none" },
  { method: "GET", path: "/api/teams/dashboard", handler: playerTeams.dashboard, auth: "user" },
  { method: "GET", path: "/api/teams/:slug", handler: playerTeams.get, auth: "none", loadUser: true },
  { method: "POST", path: "/api/teams", handler: playerTeams.create, auth: "user", tx: true },
  { method: "PATCH", path: "/api/teams/:id", handler: playerTeams.update, auth: "user", tx: true },
  { method: "POST", path: "/api/teams/:id/invitations", handler: playerTeams.invite, auth: "user", tx: true },
  { method: "POST", path: "/api/team-invitations/:id/accept", handler: playerTeams.acceptInvitation, auth: "user", tx: true },
  { method: "POST", path: "/api/team-invitations/:id/decline", handler: playerTeams.declineInvitation, auth: "user", tx: true },
  { method: "POST", path: "/api/team-invitations/:id/revoke", handler: playerTeams.revokeInvitation, auth: "user", tx: true },
  { method: "POST", path: "/api/teams/:id/leave", handler: playerTeams.leave, auth: "user", tx: true },
  { method: "POST", path: "/api/teams/:id/members/:membershipId/remove", handler: playerTeams.removeMember, auth: "user", tx: true },
  { method: "POST", path: "/api/teams/:id/leadership", handler: playerTeams.transferLeadership, auth: "user", tx: true },
  { method: "POST", path: "/api/teams/:id/archive", handler: playerTeams.archive, auth: "user", tx: true },

  { method: "GET", path: "/api/games", handler: games.listCompleted, auth: "user" },
  {
    method: "GET",
    path: "/api/games/tournament-match/:matchId",
    handler: games.getByTournamentMatch,
    auth: "user"
  },
  { method: "GET", path: "/api/games/:id", handler: games.getOne, auth: "user" },
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

  { method: "GET", path: "/api/tournaments", handler: tournaments.listPublic, auth: "none" },
  {
    method: "GET",
    path: "/api/tournaments/:slug",
    handler: tournaments.getPublic,
    auth: "none",
    loadUser: true
  },
  {
    method: "POST",
    path: "/api/tournaments/:id/join",
    handler: tournaments.join,
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/tournaments/:id/withdraw",
    handler: tournaments.withdraw,
    auth: "user",
    tx: true
  },
  { method: "POST", path: "/api/tournaments/:id/rosters", handler: teamTournaments.registerRoster, auth: "user", tx: true },
  { method: "PATCH", path: "/api/tournaments/:id/rosters/:rosterId", handler: teamTournaments.updateRoster, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/rosters/:rosterId/withdraw", handler: teamTournaments.withdrawRoster, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/roll", handler: teamTournaments.roll, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/shield", handler: teamTournaments.selectShield, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/sword", handler: teamTournaments.selectSword, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/environment", handler: teamTournaments.selectEnvironment, auth: "user", tx: true },
  {
    method: "POST",
    path: "/api/tournaments/:id/matches/:matchId/result",
    handler: tournaments.submitResult,
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/tournaments/:id/matches/:matchId/confirm-result",
    handler: tournaments.confirmResult,
    auth: "user",
    tx: true
  },
  {
    method: "POST",
    path: "/api/tournaments/:id/matches/:matchId/reject-result",
    handler: tournaments.rejectResult,
    auth: "user",
    tx: true
  },

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
  { method: "GET", path: "/api/admin/tournaments", handler: tournaments.listAdmin, auth: "admin" },
  { method: "POST", path: "/api/admin/teams/:id/restore", handler: playerTeams.restore, auth: "admin", tx: true },
  { method: "POST", path: "/api/admin/tournaments/:id/rosters/seeds", handler: teamTournaments.updateRosterSeedsAdmin, auth: "admin", tx: true },
  { method: "POST", path: "/api/admin/tournaments/:id/team-matches/:matchId/reset", handler: teamTournaments.resetMatchAdmin, auth: "admin", tx: true },
  { method: "PATCH", path: "/api/admin/tournaments/:id/team-matches/:matchId/pairings", handler: teamTournaments.overridePairingsAdmin, auth: "admin", tx: true },
  {
    method: "POST",
    path: "/api/admin/tournaments",
    handler: tournaments.createAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "GET",
    path: "/api/admin/tournaments/:id",
    handler: tournaments.getAdmin,
    auth: "admin"
  },
  {
    method: "PATCH",
    path: "/api/admin/tournaments/:id",
    handler: tournaments.updateAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/tournaments/:id",
    handler: tournaments.deleteAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/publish",
    handler: tournaments.publishAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/registration/close",
    handler: tournaments.closeRegistration,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/registration/reopen",
    handler: tournaments.reopenRegistration,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/participants",
    handler: tournaments.addParticipant,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/participants/bulk",
    handler: tournaments.bulkParticipants,
    auth: "admin",
    tx: true
  },
  {
    method: "PATCH",
    path: "/api/admin/tournaments/:id/participants/:participantId",
    handler: tournaments.updateParticipant,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/tournaments/:id/participants/:participantId",
    handler: tournaments.removeParticipant,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/seeds",
    handler: tournaments.updateSeeds,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/seeds/regenerate",
    handler: tournaments.regenerateSeeds,
    auth: "admin",
    tx: true
  },
  {
    method: "GET",
    path: "/api/admin/tournaments/:id/preview",
    handler: tournaments.previewAdmin,
    auth: "admin"
  },
  {
    method: "GET",
    path: "/api/admin/tournaments/:id/rounds/next/preview",
    handler: tournaments.previewNextRoundAdmin,
    auth: "admin"
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/start",
    handler: tournaments.startAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/rounds/next",
    handler: tournaments.generateNextRoundAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/tournaments/:id/rounds/latest",
    handler: tournaments.rollbackLatestRoundAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/tables",
    handler: tournaments.addTableAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "PATCH",
    path: "/api/admin/tournaments/:id/tables/:tableId",
    handler: tournaments.updateTableAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "DELETE",
    path: "/api/admin/tournaments/:id/tables/:tableId",
    handler: tournaments.deleteTableAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/standings/publish",
    handler: tournaments.publishFinalStandingsAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "POST",
    path: "/api/admin/tournaments/:id/matches/:matchId/result",
    handler: tournaments.saveMatchResultAdmin,
    auth: "admin",
    tx: true
  },
  {
    method: "PATCH",
    path: "/api/admin/tournaments/:id/matches/:matchId/result",
    handler: tournaments.saveMatchResultAdmin,
    auth: "admin",
    tx: true
  },
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
