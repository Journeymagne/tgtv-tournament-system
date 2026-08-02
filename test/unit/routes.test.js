const test = require("node:test");
const assert = require("node:assert/strict");

const routes = require("../../src/api/routes");

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

test("MEDIUM 3: каждый маршрут /api/admin/* требует auth: admin", () => {
  const adminRoutes = routes.filter((route) => route.path.startsWith("/api/admin/"));
  assert.ok(adminRoutes.length > 0, "sanity: there should be admin routes to check");
  for (const route of adminRoutes) {
    assert.equal(route.auth, "admin", `${route.method} ${route.path} must carry auth: "admin"`);
  }
});

test("MEDIUM 3: каждый мутирующий маршрут открывает транзакцию (tx: true)", () => {
  const mutating = routes.filter((route) => MUTATING_METHODS.has(route.method));
  assert.ok(mutating.length > 0, "sanity: there should be mutating routes to check");
  for (const route of mutating) {
    assert.equal(route.tx, true, `${route.method} ${route.path} mutates data and must carry tx: true`);
  }
});

// A fixed, hand-verified list of routes whose handler dereferences ctx.user
// (checked by reading each handler's source, not inferred at runtime -- a
// runtime check derived from this same table couldn't catch a mistake
// baked into the table itself). GET /api/me is deliberately excluded: its
// handler explicitly handles user === null (auth: "none", loadUser: true).
const REQUIRES_AUTHENTICATED_USER = [
  ["PATCH", "/api/me"],
  ["GET", "/api/users/search"],
  ["GET", "/api/users/:id"],
  ["GET", "/api/challenge-progress"],
  ["GET", "/api/games"],
  ["POST", "/api/games/:id/result"],
  ["POST", "/api/games/:id/exit"],
  ["POST", "/api/games/:id/confirm-result"],
  ["POST", "/api/games/:id/reject-result"],
  ["POST", "/api/challenges"],
  ["GET", "/api/challenges/share/:token"],
  ["POST", "/api/challenges/share/:token/accept"],
  ["POST", "/api/challenges/:id/accept"],
  ["POST", "/api/challenges/:id/decline"],
  ["POST", "/api/challenges/:id/cancel"],
  ["POST", "/api/feedback"]
];

test("MEDIUM 3: маршруты, чей обработчик разыменовывает ctx.user, требуют auth: user", () => {
  for (const [method, path] of REQUIRES_AUTHENTICATED_USER) {
    const route = routes.find((entry) => entry.method === method && entry.path === path);
    assert.ok(route, `expected a route table entry for ${method} ${path}`);
    assert.equal(route.auth, "user", `${method} ${path} dereferences ctx.user but declares auth: ${route.auth}`);
  }
});
