const achievements = require("./achievements");
const auth = require("./auth");
const email = require("./email");
const users = require("./users");
const challenges = require("./challenges");
const games = require("./games");
const feedback = require("./feedback");
const admin = require("./admin");
const tournaments = require("./tournaments");
const tournamentRegistration = require("./tournament-registration");
const playerTeams = require("./player-teams");
const teamTournaments = require("./team-tournaments");
const tournamentTableImages = require("./tournament-table-images");
const notifications = require("./notifications");
const tournamentLive = require("./tournament-live");
const documentation = require("./documentation");
const account = require("./account");
const accessManagement = require("./access-management");
const studio = require("./studio");
const studioTts = require("./studio-tts");
const studioReviews = require("./studio-reviews");
const studioComments = require("./studio-comments");
const { MAX_TOURNAMENT_REQUEST_BYTES } = require("../config");

function withAction(handler, action) {
  return (ctx) => handler({ ...ctx, params: { ...ctx.params, action } });
}

module.exports = [
  { method:"GET", path:"/api/auth/email-config", handler:email.config },
  { method:"GET", path:"/api/auth/email", handler:email.status, auth:"user" },
  { method:"POST", path:"/api/auth/email", handler:email.change, auth:"user", tx:true, emailLimit:true, maxBodyBytes:4096 },
  { method:"DELETE", path:"/api/auth/email/pending", handler:email.cancel, auth:"user", tx:true, emailLimit:true, maxBodyBytes:4096 },
  { method:"POST", path:"/api/auth/email/resend", handler:email.resend, auth:"user", tx:true, emailLimit:true, maxBodyBytes:4096 },
  { method:"POST", path:"/api/auth/email/verify", handler:email.confirm, tx:true, emailLimit:true, maxBodyBytes:4096 },
  { method:"POST", path:"/api/auth/password/forgot", handler:email.forgot, tx:true, emailLimit:true, minResponseMs:350, maxBodyBytes:4096 },
  { method:"POST", path:"/api/auth/password/reset", handler:email.reset, tx:true, emailLimit:true, maxBodyBytes:4096 },
  { method:"POST", path:"/api/email/webhook", handler:email.webhook, tx:true, rawBody:true, maxBodyBytes:65536 },
  { method:"GET", path:"/api/admin/email", handler:email.health, auth:"user", permission:"super" },
  { method:"GET", path:"/api/studio/library/:id/comments", handler:studioComments.list, loadUser:true },
  { method:"GET", path:"/api/studio/library/:id/comments/:commentId/context", handler:studioComments.context, loadUser:true },
  { method:"GET", path:"/api/studio/library/:id/comments/:commentId/replies", handler:studioComments.replies, loadUser:true },
  { method:"POST", path:"/api/studio/library/:id/comments", handler:studioComments.create, auth:"user", tx:true, maxBodyBytes:16384 },
  { method:"PATCH", path:"/api/studio/library/:id/comments/:commentId", handler:studioComments.update, auth:"user", tx:true, maxBodyBytes:16384 },
  { method:"DELETE", path:"/api/studio/library/:id/comments/:commentId", handler:studioComments.remove, auth:"user", tx:true },
  { method:"POST", path:"/api/studio/library/:id/comments/:commentId/reports", handler:studioComments.report, auth:"user", tx:true },
  { method:"GET", path:"/api/studio/admin/library/:id/comments", handler:studioComments.adminList, auth:"admin" },
  { method:"GET", path:"/api/studio/admin/library/:id/comments/:commentId/replies", handler:studioComments.adminReplies, auth:"admin" },
  { method:"GET", path:"/api/studio/admin/library/:id/comments/:commentId/context", handler:studioComments.adminContext, auth:"admin" },
  { method:"GET", path:"/api/studio/admin/library/:id/comments/:commentId/history", handler:studioComments.history, auth:"admin" },
  { method:"POST", path:"/api/studio/admin/library/:id/comments/:commentId/moderation", handler:studioComments.moderate, auth:"admin", tx:true },
  { method:"GET", path:"/api/studio/admin/comment-reports", handler:studioComments.reports, auth:"admin" },
  { method:"PATCH", path:"/api/studio/admin/comment-reports/:reportId", handler:studioComments.resolve, auth:"admin", tx:true },
  { method:"GET", path:"/api/studio/library/:id/reviews", handler:studioReviews.list, loadUser:true },
  { method:"GET", path:"/api/studio/library/:id/reviews/:reviewId", handler:studioReviews.get, loadUser:true },
  { method:"POST", path:"/api/studio/library/:id/reviews", handler:studioReviews.create, auth:"user", tx:true, maxBodyBytes:32768 },
  { method:"PATCH", path:"/api/studio/library/:id/reviews/:reviewId", handler:studioReviews.update, auth:"user", tx:true, maxBodyBytes:32768 },
  { method:"DELETE", path:"/api/studio/library/:id/reviews/:reviewId", handler:studioReviews.remove, auth:"user", tx:true },
  { method:"POST", path:"/api/studio/library/:id/reviews/:reviewId/reports", handler:studioReviews.report, auth:"user", tx:true },
  { method:"GET", path:"/api/studio/review-preferences", handler:studioReviews.preferences, auth:"user" },
  { method:"PATCH", path:"/api/studio/review-preferences", handler:studioReviews.updatePreferences, auth:"user", tx:true },
  { method:"GET", path:"/api/studio/admin/review-reports", handler:studioReviews.reports, auth:"admin" },
  { method:"PATCH", path:"/api/studio/admin/review-reports/:reportId", handler:studioReviews.resolve, auth:"admin", tx:true },
  { method:"GET", path:"/api/studio/admin/library/:id/reviews", handler:studioReviews.adminList, auth:"admin" },
  { method:"GET", path:"/api/studio/admin/library/:id/reviews/:reviewId/history", handler:studioReviews.history, auth:"admin" },
  { method:"POST", path:"/api/studio/admin/library/:id/reviews/:reviewId/moderation", handler:studioReviews.moderate, auth:"admin", tx:true },
  { method:"PATCH", path:"/api/studio/admin/library/:id/discussion", handler:studioReviews.lock, auth:"admin", tx:true },
  { method: "PATCH", path: "/api/admin/tournaments/:id/owner", handler: accessManagement.transferOwner, auth: "user", permission: "super", tx: true },
  { method: "GET", path: "/api/admin/audit", handler: accessManagement.auditLog, auth: "admin" },
  { method: "PATCH", path: "/api/admin/users/:id/permissions", handler: accessManagement.setPermissions, auth: "user", permission: "super", tx: true },
  { method: "PATCH", path: "/api/admin/users/:id/suspension", handler: accessManagement.suspendUser, auth: "admin", tx: true },
  { method: "GET", path: "/api/admin/tournaments/:id/staff", handler: accessManagement.staff, auth: "user", permission: "tournament.manage" },
  { method: "POST", path: "/api/admin/tournaments/:id/judges", handler: accessManagement.assignJudge, auth: "user", permission: "judges.manage", tx: true },
  { method: "DELETE", path: "/api/admin/tournaments/:id/judges/:userId", handler: accessManagement.revokeJudge, auth: "user", permission: "judges.manage", tx: true },
  { method: "GET", path: "/api/admin/tournaments/:id/export.xlsx", handler: tournaments.exportAdmin, auth: "admin" },
  { method: "GET", path: "/api/teams/:id/members", handler: playerTeams.members, auth: "user" },
  { method: "GET", path: "/api/tournaments/revision", handler: tournamentLive.revision, auth: "none", loadUser: true },
  ...["team", "tournament", "roster"].map(kind => ({ method: "GET", path: "/api/" + kind + "-logos/:id", handler: ctx => tournamentLive.logo({ ...ctx, params: { ...ctx.params, kind } }), auth: "none", loadUser: true })),
  { method: "PATCH", path: "/api/admin/tournaments/:id/participants/:participantId/payment", handler: tournamentRegistration.participantPayment, auth: "admin", tx: true },
  { method: "PATCH", path: "/api/admin/tournaments/:id/rosters/:rosterId/payment", handler: tournamentRegistration.rosterPayment, auth: "admin", tx: true },
  { method: "GET", path: "/api/tournament-table-images/:id", handler: tournamentTableImages.image, auth: "none", loadUser: true },
  { method: "GET", path: "/api/achievements", handler: achievements.list, auth: "none" },
  { method: "GET", path: "/api/achievements/:id", handler: achievements.get, auth: "none" },
  { method: "GET", path: "/api/achievements/:id/image", handler: achievements.image, auth: "none" },
  { method: "POST", path: "/api/achievements", handler: achievements.create, auth: "admin", tx: true },
  { method: "PATCH", path: "/api/achievements/:id", handler: achievements.update, auth: "admin", tx: true },
  { method: "DELETE", path: "/api/achievements/:id", handler: achievements.remove, auth: "admin", tx: true },
  { method: "POST", path: "/api/achievements/:id/awards", handler: achievements.award, auth: "admin", tx: true },
  { method: "GET", path: "/api/session", handler: account.session, auth: "none", loadUser: true },
  { method: "GET", path: "/api/studio/session", handler: studio.session, auth: "user" },
  { method: "GET", path: "/api/studio/drafts", handler: studio.drafts, auth: "user" },
  { method: "GET", path: "/api/studio/drafts/:id", handler: studio.draft, auth: "user" },
  { method: "PUT", path: "/api/studio/drafts/:id", handler: studio.save, auth: "user", tx: true, maxBodyBytes: studio.MAX_BODY },
  { method: "DELETE", path: "/api/studio/drafts/:id", handler: studio.remove, auth: "user", tx: true },
  { method: "PATCH", path: "/api/studio/drafts/:id/name", handler: studio.rename, auth: "user", tx: true },
  { method: "POST", path: "/api/studio/drafts/:id/publish", handler: studio.publish, auth: "user", tx: true, maxBodyBytes: studio.MAX_BODY },
  { method: "GET", path: "/api/studio/library", handler: studio.library, auth: "none", loadUser: true },
  { method: "GET", path: "/api/studio/library/:id", handler: studio.publication, auth: "none", loadUser: true },
  { method: "POST", path: "/api/studio/tts/exports", handler: studioTts.create, auth: "user", tx: true, maxBodyBytes: studioTts.MAX_BODY },
  { method: "GET", path: "/api/studio/tts/exports", handler: studioTts.list, auth: "user" },
  { method: "DELETE", path: "/api/studio/tts/exports/:id", handler: studioTts.remove, auth: "user", tx: true },
  { method: "GET", path: "/api/studio/tts/exports/:id/manifest", handler: studioTts.manifest, auth: "none" },
  { method: "GET", path: "/api/studio/tts/exports/:id/object.json", handler: studioTts.downloadObject, auth: "none" },
  { method: "GET", path: "/api/studio/tts/exports/:id/assets/:name", handler: studioTts.asset, auth: "none" },
  { method: "GET", path: "/api/studio/tts/importer", handler: studioTts.downloadImporter, auth: "none" },
  { method: "GET", path: "/api/studio/tts/importer.lua", handler: studioTts.downloadImporter, auth: "none" },
  { method: "GET", path: "/api/documentation/:locale", handler: documentation.list, auth: "none" },
  { method: "GET", path: "/api/documentation/:locale/:id", handler: documentation.get, auth: "none" },
  { method: "POST", path: "/api/admin/documentation/preview", handler: documentation.preview, auth: "admin", tx: true },
  { method: "PATCH", path: "/api/admin/documentation/:locale/:id", handler: documentation.update, auth: "admin", tx: true },
  { method: "GET", path: "/api/me", handler: auth.me, auth: "none", loadUser: true },
  { method: "GET", path: "/api/me/team-pairings", handler: auth.myTeamPairings, auth: "user" },
  { method: "PATCH", path: "/api/me", handler: auth.updateMe, auth: "user", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/register", handler: auth.register, auth: "none", tx: true, rateLimit: "auth", emailLimit: "when-enabled", maxBodyBytes:8192 },
  { method: "POST", path: "/api/setup-admin", handler: auth.setupAdmin, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/login", handler: auth.login, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/logout", handler: auth.logout, auth: "none", tx: true },

  { method: "GET", path: "/api/users", handler: users.list, auth: "none" },
  { method: "GET", path: "/api/users/:id/avatar", handler: users.avatar, auth: "none" },
  { method: "GET", path: "/api/users/search", handler: users.search, auth: "user" },
  { method: "GET", path: "/api/users/:id", handler: users.profile, auth: "user" },
  { method: "GET", path: "/api/challenge-progress", handler: users.challengeProgress, auth: "user" },
  { method: "GET", path: "/api/notifications", handler: notifications.list, auth: "user", tx: true },
  { method: "POST", path: "/api/notifications/read", handler: notifications.markRead, auth: "user", tx: true },

  { method: "GET", path: "/api/teams", handler: playerTeams.list, auth: "none" },
  { method: "GET", path: "/api/teams/dashboard", handler: playerTeams.dashboard, auth: "user" },
  { method: "GET", path: "/api/leaderboards/teams", handler: playerTeams.leaderboard, auth: "none" },
  { method: "GET", path: "/api/admin/teams", handler: playerTeams.administration, auth: "admin" },
  { method: "GET", path: "/api/teams/:slug", handler: playerTeams.get, auth: "none", loadUser: true },
  { method: "POST", path: "/api/teams", handler: playerTeams.create, auth: "user", tx: true },
  { method: "PATCH", path: "/api/teams/:id", handler: playerTeams.update, auth: "user", tx: true },
  { method: "DELETE", path: "/api/teams/:id", handler: playerTeams.remove, auth: "user", tx: true },
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
  { method: "GET", path: "/api/tournaments/:slug/rules", handler: tournaments.getRules, auth: "none" },
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
  { method: "DELETE", path: "/api/tournaments/:id/rosters/:rosterId", handler: teamTournaments.deleteRoster, auth: "user", tx: true },
  { method: "GET", path: "/api/rosters/:rosterId", handler: teamTournaments.getRoster, auth: "none", loadUser: true },
  { method: "GET", path: "/api/team-matches/:matchId", handler: teamTournaments.getPairingMatch, auth: "none", loadUser: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/initiative", handler: teamTournaments.selectInitiative, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/manual", handler: teamTournaments.manualPairings, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/roll", handler: teamTournaments.roll, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/undo", handler: teamTournaments.undoPairing, auth: "user", tx: true },
  { method: "POST", path: "/api/tournaments/:id/team-matches/:matchId/ban", handler: teamTournaments.banMission, auth: "user", tx: true },
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
  { method: "POST", path: "/api/admin/games/:id/recalculate-rating", handler: admin.recalculateGameRating, auth: "admin", tx: true },
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
  { method: "POST", path: "/api/admin/tournaments/:id/rosters", handler: teamTournaments.registerRoster, auth: "admin", tx: true },
  { method: "POST", path: "/api/admin/tournaments/:id/rosters/seeds", handler: teamTournaments.updateRosterSeedsAdmin, auth: "admin", tx: true },
  { method: "POST", path: "/api/admin/tournaments/:id/team-matches/:matchId/reset", handler: teamTournaments.resetMatchAdmin, auth: "admin", tx: true },
  { method: "PATCH", path: "/api/admin/tournaments/:id/team-matches/:matchId/pairings", handler: teamTournaments.overridePairingsAdmin, auth: "admin", tx: true },
  {
    method: "POST",
    path: "/api/admin/tournaments",
    handler: tournaments.createAdmin,
    maxBodyBytes: MAX_TOURNAMENT_REQUEST_BYTES,
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
    maxBodyBytes: MAX_TOURNAMENT_REQUEST_BYTES,
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
    maxBodyBytes: MAX_TOURNAMENT_REQUEST_BYTES,
    auth: "admin",
    tx: true
  },
  {
    method: "GET",
    path: "/api/admin/tournaments/:id/rounds/:roundId/tables",
    handler: require("./round-tables").getAdmin,
    auth: "admin"
  },
  {
    method: "PATCH",
    path: "/api/admin/tournaments/:id/rounds/:roundId/tables",
    handler: require("./round-tables").updateAdmin,
    maxBodyBytes: MAX_TOURNAMENT_REQUEST_BYTES,
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
    path: "/api/admin/tournaments/:id/standings/recalculate",
    handler: tournaments.recalculateStandingsAdmin,
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
].map(route => {
  if (route.permission) return route;
  if (route.path.startsWith("/api/admin/tournaments/:id")) return { ...route, auth: "user", permission: "tournament.manage" };
  if (route.path === "/api/admin/tournaments") return { ...route, auth: "user",
    permission: route.method === "POST" ? "tournaments.create" : "administration" };
  if (/^\/api\/admin\/games\/:id\/(result|confirm-result)$/.test(route.path)) return { ...route, auth: "user", permission: "game.manage" };
  if (route.path === "/api/tournaments/:slug/rules") return { ...route, loadUser: true };
  return route;
});
