const auth = require("./auth");
const notifications = require("./notifications");

module.exports = [
  { method: "GET", path: "/api/notifications", handler: notifications.list, auth: "user", tx: true },
  { method: "POST", path: "/api/notifications/read", handler: notifications.markRead, auth: "user", tx: true }
].map(route => {
  if (route.permission) return route;
  if (route.path.startsWith("/api/admin/tournaments/:id")) return { ...route, auth: "user", permission: "tournament.manage" };
  if (route.path === "/api/admin/tournaments") return { ...route, auth: "user",
    permission: route.method === "POST" ? "tournaments.create" : "administration" };
  if (/^\/api\/admin\/games\/:id\/(result|confirm-result)$/.test(route.path)) return { ...route, auth: "user", permission: "game.manage" };
  if (route.path === "/api/tournaments/:slug/rules") return { ...route, loadUser: true };
  return route;
});
