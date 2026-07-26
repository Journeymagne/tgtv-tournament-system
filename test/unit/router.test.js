const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { matchRoute, normalizeApiPath, createRouter } = require("../../src/http/router");
const { createRateLimiter } = require("../../src/http/rate-limit");
const { HttpError } = require("../../src/http/io");
const { captureStream } = require("../helpers/capture-stream");

test("normalizeApiPath срезает завершающий слэш", () => {
  assert.equal(normalizeApiPath("/api/users/"), "/api/users");
  assert.equal(normalizeApiPath("/api/users"), "/api/users");
  assert.equal(normalizeApiPath("/"), "/");
});

test("matchRoute находит статический путь", () => {
  const routes = [{ method: "GET", path: "/api/me", handler: () => {} }];
  const match = matchRoute(routes, "GET", "/api/me");
  assert.ok(match);
  assert.deepEqual(match.params, {});
});

test("matchRoute извлекает параметры", () => {
  const routes = [{ method: "POST", path: "/api/games/:id/result", handler: () => {} }];
  const match = matchRoute(routes, "POST", "/api/games/42/result");
  assert.deepEqual(match.params, { id: "42" });
});

test("matchRoute различает методы", () => {
  const routes = [{ method: "GET", path: "/api/me", handler: () => {} }];
  assert.equal(matchRoute(routes, "PATCH", "/api/me"), null);
});

test("matchRoute не путает разное число сегментов", () => {
  const routes = [{ method: "GET", path: "/api/users/:id", handler: () => {} }];
  assert.equal(matchRoute(routes, "GET", "/api/users/1/extra"), null);
});

test("статический маршрут выигрывает у параметрического", () => {
  const routes = [
    { method: "GET", path: "/api/users/:id", handler: () => "param" },
    { method: "GET", path: "/api/users/search", handler: () => "static" }
  ];
  const match = matchRoute(routes, "GET", "/api/users/search");
  assert.equal(match.route.handler(), "static");
});

test("при равном числе динамических сегментов побеждает позиционная специфичность, а не порядок в таблице маршрутов", () => {
  // Both routes have exactly one dynamic segment, so a count-only sort
  // can't break the tie and falls back to array order. /api/foo/:x has a
  // static segment ("foo") at index 1 where /api/:y/bar has a dynamic one,
  // so /api/foo/:x is the more specific match for /api/foo/bar regardless
  // of which route was declared first.
  const routeFooX = { method: "GET", path: "/api/foo/:x", handler: () => "foo-x" };
  const routeYBar = { method: "GET", path: "/api/:y/bar", handler: () => "y-bar" };

  const forward = matchRoute([routeFooX, routeYBar], "GET", "/api/foo/bar");
  const reversed = matchRoute([routeYBar, routeFooX], "GET", "/api/foo/bar");

  assert.equal(forward.route.handler(), "foo-x");
  assert.equal(reversed.route.handler(), "foo-x");
});

async function callRouter(routes, deps, method, path, body) {
  const router = createRouter(routes, deps);
  const server = http.createServer((req, res) => router(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  await new Promise((resolve) => server.close(resolve));
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const noDbDeps = {
  withClient: (fn) => fn(null),
  withTransaction: (fn) => fn(null),
  loadUser: async () => null
};

test("обработчик отдаёт 200 с телом", async () => {
  const routes = [{ method: "GET", path: "/api/ping", handler: async () => ({ pong: true }) }];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/ping");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { pong: true });
});

test("обработчик может задать статус и заголовки", async () => {
  const routes = [
    {
      method: "POST",
      path: "/api/thing",
      handler: async () => ({ status: 201, body: { created: true } })
    }
  ];
  const res = await callRouter(routes, noDbDeps, "POST", "/api/thing", {});
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { created: true });
});

test("параметры и тело доезжают до обработчика", async () => {
  const routes = [
    {
      method: "POST",
      path: "/api/echo/:id",
      handler: async ({ params, body }) => ({ id: params.id, got: body.value })
    }
  ];
  const res = await callRouter(routes, noDbDeps, "POST", "/api/echo/7", { value: "x" });
  assert.deepEqual(res.body, { id: "7", got: "x" });
});

test("HttpError отдаётся заявленным статусом", async () => {
  const routes = [
    {
      method: "GET",
      path: "/api/conflict",
      handler: async () => {
        throw new HttpError(409, "Already handled");
      }
    }
  ];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/conflict");
  assert.equal(res.status, 409);
  assert.equal(res.body.error, "Already handled");
});

test("неожиданная ошибка отдаётся как 500 без деталей", async () => {
  const routes = [
    {
      method: "GET",
      path: "/api/boom",
      handler: async () => {
        throw new TypeError("secret internal detail");
      }
    }
  ];
  // logError writes to stderr by design (C1: real errors must be logged for
  // operators). Capture it so this expected error log doesn't pollute the
  // test run, using the shared capture pattern from test/unit/logger.test.js.
  const stderr = captureStream(process.stderr);
  let res;
  try {
    res = await callRouter(routes, noDbDeps, "GET", "/api/boom");
  } finally {
    stderr.restore();
  }
  assert.equal(res.status, 500);
  assert.equal(res.body.error, "Server error");
  assert.ok(!JSON.stringify(res.body).includes("secret internal detail"));
  assert.equal(stderr.calls.length, 1);
  assert.ok(stderr.calls[0].includes("secret internal detail"));
});

test("некорректный %-код в параметре пути отдаёт 404, а не 500, и не пишет лог ошибки", async () => {
  const routes = [
    { method: "GET", path: "/api/users/:id", handler: async () => ({ ok: true }) }
  ];
  // %zz is not valid percent-encoding; decodeURIComponent throws on it.
  // That's bad client input, not a server fault (C1), so it must fall
  // through to the normal 404 with nothing sent to logError.
  const stderr = captureStream(process.stderr);
  let res;
  try {
    res = await callRouter(routes, noDbDeps, "GET", "/api/users/%zz");
  } finally {
    stderr.restore();
  }
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Route not found");
  assert.equal(stderr.calls.length, 0);
});

test("неизвестный маршрут отдаёт 404", async () => {
  const res = await callRouter([], noDbDeps, "GET", "/api/nothing");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "Route not found");
});

test("auth: user без сессии отдаёт 401", async () => {
  const routes = [
    { method: "GET", path: "/api/secret", auth: "user", handler: async () => ({ ok: true }) }
  ];
  const res = await callRouter(routes, noDbDeps, "GET", "/api/secret");
  assert.equal(res.status, 401);
});

test("auth: admin для обычного пользователя отдаёт 403", async () => {
  const deps = { ...noDbDeps, loadUser: async () => ({ id: 1, isAdmin: false }) };
  const routes = [
    { method: "GET", path: "/api/admin/thing", auth: "admin", handler: async () => ({ ok: true }) }
  ];
  const res = await callRouter(routes, deps, "GET", "/api/admin/thing");
  assert.equal(res.status, 403);
});

test("tx: true запускает обработчик в транзакции", async () => {
  const calls = [];
  const deps = {
    withClient: (fn) => {
      calls.push("client");
      return fn(null);
    },
    withTransaction: (fn) => {
      calls.push("transaction");
      return fn(null);
    },
    loadUser: async () => null
  };
  const routes = [
    { method: "POST", path: "/api/write", tx: true, handler: async () => ({ ok: true }) },
    { method: "GET", path: "/api/read", handler: async () => ({ ok: true }) }
  ];
  await callRouter(routes, deps, "POST", "/api/write", {});
  await callRouter(routes, deps, "GET", "/api/read");
  assert.deepEqual(calls, ["transaction", "client"]);
});

test("loadUser и обработчик получают одну и ту же ссылку на client (гарантия A1)", async () => {
  const sharedClient = { marker: "shared-client" };
  let clientSeenByLoadUser = null;
  let clientSeenByHandler = null;
  const deps = {
    withClient: (fn) => fn(sharedClient),
    withTransaction: (fn) => fn(sharedClient),
    loadUser: async (client) => {
      clientSeenByLoadUser = client;
      return { id: 1, isAdmin: false };
    }
  };
  const routes = [
    {
      method: "GET",
      path: "/api/shared",
      auth: "user",
      handler: async ({ client }) => {
        clientSeenByHandler = client;
        return { ok: true };
      }
    }
  ];

  const res = await callRouter(routes, deps, "GET", "/api/shared");

  assert.equal(res.status, 200);
  assert.ok(clientSeenByLoadUser);
  assert.equal(clientSeenByLoadUser, clientSeenByHandler);
});

test("превышение auth-лимита отдаёт 429 без единого обращения к транзакции/пулу (Finding 1)", async () => {
  const calls = [];
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const deps = {
    withClient: (fn) => {
      calls.push("client");
      return fn(null);
    },
    withTransaction: (fn) => {
      calls.push("transaction");
      return fn(null);
    },
    loadUser: async () => null,
    authLimiter: limiter
  };
  const routes = [
    {
      method: "POST",
      path: "/api/login",
      auth: "none",
      tx: true,
      rateLimit: "auth",
      handler: async () => ({ ok: true })
    }
  ];

  const first = await callRouter(routes, deps, "POST", "/api/login", {});
  const second = await callRouter(routes, deps, "POST", "/api/login", {});
  const third = await callRouter(routes, deps, "POST", "/api/login", {});

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.body.error, "Too many attempts. Try again later.");
  // Exactly two runner invocations - one per allowed request. The rejected
  // third request must never reach withTransaction/withClient at all: no
  // pool checkout, no BEGIN/ROLLBACK for a request the limiter is rejecting.
  assert.deepEqual(calls, ["transaction", "transaction"]);
});

test("createRouter по умолчанию использует общий лимитер модуля, если deps.authLimiter не передан", async () => {
  // No authLimiter in deps: createRouter must fall back to the shared
  // module-level instance so server.js (which passes no limiter) keeps
  // working unchanged. This only proves the route still resolves and the
  // rateLimit branch doesn't throw when deps omit authLimiter entirely;
  // the dedicated test above (with an injected limiter) proves the 429/
  // no-runner-call behaviour precisely.
  const deps = {
    withClient: (fn) => fn(null),
    withTransaction: (fn) => fn(null),
    loadUser: async () => null
  };
  const routes = [
    {
      method: "POST",
      path: "/api/default-limiter",
      auth: "none",
      tx: true,
      rateLimit: "auth",
      handler: async () => ({ ok: true })
    }
  ];

  const res = await callRouter(routes, deps, "POST", "/api/default-limiter", {});
  assert.equal(res.status, 200);
});
