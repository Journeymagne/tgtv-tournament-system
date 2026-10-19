const auth = require("./auth");
const email = require("./email");
const users = require("./users");
const admin = require("./admin");
const account = require("./account");
const accessManagement = require("./access-management");
const feedback = require('./feedback');

module.exports = [
  { method:'GET', path:'/api/admin/audit', handler:accessManagement.auditLog, auth:'admin' },
  { method:'POST', path:'/api/feedback', handler:feedback.create, auth:'user', tx:true },
  { method:'GET', path:'/api/admin/feedback', handler:feedback.list, auth:'admin' },
  { method:'PATCH', path:'/api/admin/feedback/:id', handler:feedback.updateStatus, auth:'admin', tx:true },
  { method:'DELETE', path:'/api/admin/feedback/:id', handler:feedback.remove, auth:'admin', tx:true },
  ...require('./faq').routes.filter(route => route.path.startsWith('/api/faq/moderators')),
  { method:'GET', path:'/api/account', handler:account.profile, auth:'user' },
  { method:'PATCH', path:'/api/account', handler:auth.updateMe, auth:'user', tx:true, rateLimit:'auth' },
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
  { method: "PATCH", path: "/api/admin/users/:id/permissions", handler: accessManagement.setPermissions, auth: "user", permission: "super", tx: true },
  { method: "PATCH", path: "/api/admin/users/:id/suspension", handler: accessManagement.suspendUser, auth: "admin", tx: true },
  { method: "GET", path: "/api/session", handler: account.session, auth: "none", loadUser: true },
  { method: "PATCH", path: "/api/me", handler: auth.updateMe, auth: "user", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/register", handler: auth.register, auth: "none", tx: true, rateLimit: "auth", emailLimit: "when-enabled", maxBodyBytes:8192 },
  { method: "POST", path: "/api/setup-admin", handler: auth.setupAdmin, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/login", handler: auth.login, auth: "none", tx: true, rateLimit: "auth" },
  { method: "POST", path: "/api/logout", handler: auth.logout, auth: "none", tx: true },
  { method: "GET", path: "/api/users/:id/avatar", handler: users.avatar, auth: "none" },
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
