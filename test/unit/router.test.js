const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { PassThrough } = require("node:stream");

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

async function callRouter(routes, deps, method, path, body, headers = {}) {
  const router = createRouter(routes, deps);
  const server = http.createServer((req, res) => router(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
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
  // Handler always fails: since Blocker 1, only failures spend budget (a
  // successful attempt never does - see the dedicated test below), so this
  // route needs to genuinely fail to exercise the max: 2 cutoff at all.
  const routes = [
    {
      method: "POST",
      path: "/api/login",
      auth: "none",
      tx: true,
      rateLimit: "auth",
      handler: async () => {
        throw new HttpError(401, "Invalid name or password");
      }
    }
  ];

  const first = await callRouter(routes, deps, "POST", "/api/login", {});
  const second = await callRouter(routes, deps, "POST", "/api/login", {});
  const third = await callRouter(routes, deps, "POST", "/api/login", {});

  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
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

test("Blocker 1: успешные попытки не расходуют бюджет rateLimit: auth — расходуют только ошибки", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  let shouldFail = false;
  const routes = [
    {
      method: "POST",
      path: "/api/login",
      auth: "none",
      tx: true,
      rateLimit: "auth",
      handler: async () => {
        if (shouldFail) throw new HttpError(401, "Invalid name or password");
        return { ok: true };
      }
    }
  ];
  const deps = {
    withClient: (fn) => fn(null),
    withTransaction: (fn) => fn(null),
    loadUser: async () => null,
    authLimiter: limiter
  };

  // Far more successful "sign-ins" than max: none of them may trip the limiter.
  for (let i = 0; i < 10; i += 1) {
    const res = await callRouter(routes, deps, "POST", "/api/login", {});
    assert.equal(res.status, 200, `successful attempt #${i} must not be rate limited`);
  }

  // Now spend the budget with genuine failures: max is 2, so the 3rd trips it.
  shouldFail = true;
  const first = await callRouter(routes, deps, "POST", "/api/login", {});
  const second = await callRouter(routes, deps, "POST", "/api/login", {});
  const third = await callRouter(routes, deps, "POST", "/api/login", {});
  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  assert.equal(third.status, 429);
});

test("Blocker 1: TRUST_PROXY выключен по умолчанию — подменённый X-Forwarded-For не создаёт отдельный бюджет", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const routes = [
    {
      method: "POST",
      path: "/api/login",
      auth: "none",
      tx: true,
      rateLimit: "auth",
      handler: async () => {
        throw new HttpError(401, "Invalid name or password");
      }
    }
  ];
  const deps = {
    withClient: (fn) => fn(null),
    withTransaction: (fn) => fn(null),
    loadUser: async () => null,
    authLimiter: limiter
    // trustProxy omitted -> defaults to config.TRUST_PROXY, which is off.
  };

  const first = await callRouter(routes, deps, "POST", "/api/login", {}, { "x-forwarded-for": "1.1.1.1" });
  const second = await callRouter(routes, deps, "POST", "/api/login", {}, { "x-forwarded-for": "2.2.2.2" });

  assert.equal(first.status, 401);
  // Both requests arrive from the same real remoteAddress (127.0.0.1)
  // despite claiming different X-Forwarded-For values -- with trustProxy
  // off the header is never consulted, so they share one bucket and the
  // second trips max: 1.
  assert.equal(second.status, 429);
});

test("Blocker 1: TRUST_PROXY включён — используется добавленный прокси (правый) адрес цепочки", async () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  const routes = [
    {
      method: "POST",
      path: "/api/login",
      auth: "none",
      tx: true,
      rateLimit: "auth",
      handler: async () => {
        throw new HttpError(401, "Invalid name or password");
      }
    }
  ];
  const deps = {
    withClient: (fn) => fn(null),
    withTransaction: (fn) => fn(null),
    loadUser: async () => null,
    authLimiter: limiter,
    trustProxy: true
  };

  // Both requests claim the SAME spoofed leftmost ("client-controlled")
  // entry but arrive with DIFFERENT rightmost (proxy-appended) addresses --
  // these must be treated as two different clients, each with its own budget.
  const first = await callRouter(
    routes, deps, "POST", "/api/login", {}, { "x-forwarded-for": "9.9.9.9, 5.5.5.5" }
  );
  const second = await callRouter(
    routes, deps, "POST", "/api/login", {}, { "x-forwarded-for": "9.9.9.9, 6.6.6.6" }
  );
  assert.equal(first.status, 401);
  assert.equal(second.status, 401, "a different proxy-appended address must get its own budget");

  // Repeating the first request's rightmost address is genuinely the same
  // client hitting max: 1 again, so it must now be blocked.
  const third = await callRouter(
    routes, deps, "POST", "/api/login", {}, { "x-forwarded-for": "9.9.9.9, 5.5.5.5" }
  );
  assert.equal(third.status, 429);
});

test("Blocker 2: тело запроса читается до получения клиента из пула", async () => {
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
    {
      method: "POST",
      path: "/api/upload",
      tx: true,
      auth: "none",
      handler: async ({ body }) => ({ echoed: body })
    }
  ];
  const router = createRouter(routes, deps);

  // A hand-built req that we control byte-by-byte, standing in for a slow
  // client upload (e.g. a ~1MB avatar PATCH over poor Wi-Fi): nothing is
  // written to it until the test says so.
  const req = new PassThrough();
  req.method = "POST";
  req.url = "/api/upload";
  req.headers = { host: "localhost" };
  req.socket = { remoteAddress: "127.0.0.1" };
  const res = { headersSent: false, writeHead() {}, end() {} };

  const pending = router(req, res);

  // Let a few ticks pass with the body still unsent. Pre-fix, the runner
  // (withTransaction) was invoked BEFORE the body was read, so "transaction"
  // would already be in `calls` here.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [], "no pool client should be acquired before the body is fully read");

  req.end(Buffer.from(JSON.stringify({ hello: "world" })));
  await pending;

  assert.deepEqual(calls, ["transaction"]);
});
