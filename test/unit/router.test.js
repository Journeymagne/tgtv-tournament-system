const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { matchRoute, normalizeApiPath, createRouter } = require("../../src/http/router");
const { HttpError } = require("../../src/http/io");

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
  // test run, mirroring the capture pattern in test/unit/logger.test.js.
  const originalWrite = process.stderr.write;
  const stderrCalls = [];
  process.stderr.write = (chunk, ...rest) => {
    stderrCalls.push(String(chunk));
    if (typeof rest[rest.length - 1] === "function") rest[rest.length - 1]();
    return true;
  };
  let res;
  try {
    res = await callRouter(routes, noDbDeps, "GET", "/api/boom");
  } finally {
    process.stderr.write = originalWrite;
  }
  assert.equal(res.status, 500);
  assert.equal(res.body.error, "Server error");
  assert.ok(!JSON.stringify(res.body).includes("secret internal detail"));
  assert.equal(stderrCalls.length, 1);
  assert.ok(stderrCalls[0].includes("secret internal detail"));
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
