const auth = require("./auth");
const admin = require("./admin");
const studio = require("./studio");
const studioTts = require("./studio-tts");
const studioReviews = require("./studio-reviews");
const studioComments = require("./studio-comments");

module.exports = [
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
  { method: "GET", path: "/api/studio/session", handler: studio.session, auth: "user" },
  { method: "GET", path: "/api/studio/drafts", handler: studio.drafts, auth: "user" },
  { method: "GET", path: "/api/studio/drafts/:id", handler: studio.draft, auth: "user" },
  { method: "PUT", path: "/api/studio/drafts/:id", handler: studio.save, auth: "user", tx: true, maxBodyBytes: studio.MAX_BODY },
  { method: "DELETE", path: "/api/studio/drafts/:id", handler: studio.remove, auth: "user", tx: true },
  { method: "PATCH", path: "/api/studio/drafts/:id/name", handler: studio.rename, auth: "user", tx: true },
  { method: "POST", path: "/api/studio/drafts/:id/publish", handler: studio.publish, auth: "user", tx: true, maxBodyBytes: studio.MAX_BODY },
  { method: "GET", path: "/api/studio/library", handler: studio.library, auth: "none", loadUser: true },
  { method: "GET", path: "/api/studio/library/:id", handler: studio.publication, auth: "none", loadUser: true },
  { method: "DELETE", path: "/api/studio/admin/library/:id", handler: studio.removePublication, auth: "user", permission: "super", tx: true },
  { method: "POST", path: "/api/studio/tts/exports", handler: studioTts.create, auth: "user", tx: true, maxBodyBytes: studioTts.MAX_BODY },
  { method: "GET", path: "/api/studio/tts/exports", handler: studioTts.list, auth: "user" },
  { method: "DELETE", path: "/api/studio/tts/exports/:id", handler: studioTts.remove, auth: "user", tx: true },
  { method: "GET", path: "/api/studio/tts/exports/:id/manifest", handler: studioTts.manifest, auth: "none" },
  { method: "GET", path: "/api/studio/tts/exports/:id/object.json", handler: studioTts.downloadObject, auth: "none" },
  { method: "GET", path: "/api/studio/tts/exports/:id/assets/:name", handler: studioTts.asset, auth: "none" },
  { method: "GET", path: "/api/studio/tts/importer", handler: studioTts.downloadImporter, auth: "none" },
  { method: "GET", path: "/api/studio/tts/importer.lua", handler: studioTts.downloadImporter, auth: "none" }
].map(route => {
  if (route.permission) return route;
  if (route.path.startsWith("/api/admin/tournaments/:id")) return { ...route, auth: "user", permission: "tournament.manage" };
  if (route.path === "/api/admin/tournaments") return { ...route, auth: "user",
    permission: route.method === "POST" ? "tournaments.create" : "administration" };
  if (/^\/api\/admin\/games\/:id\/(result|confirm-result)$/.test(route.path)) return { ...route, auth: "user", permission: "game.manage" };
  if (route.path === "/api/tournaments/:slug/rules") return { ...route, loadUser: true };
  return route;
});
