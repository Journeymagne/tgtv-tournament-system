const test = require("node:test");
const assert = require("node:assert/strict");

const { loadUserFromRequest } = require("../../src/api/auth");
const { SESSION_TTL_MS, SESSION_RENEW_AFTER_MS } = require("../../src/config");

// A stand-in for the pg client: the repository SQL is exercised against a real
// database in test/integration, so here only the branch loadUserFromRequest
// takes matters -- does it extend the session, and does it hand the router a
// cookie to ship.
function fakeClient(row) {
  const queries = [];
  return {
    queries,
    async query(text, params) {
      queries.push({ text, params });
      if (/^\s*SELECT/i.test(text)) return { rows: row ? [row] : [] };
      return { rows: [] };
    }
  };
}

function sessionRow(expiresAt) {
  return {
    id: 7,
    name: "Tester",
    password_hash: "hash",
    is_admin: false,
    rating: 1000,
    expires_at: expiresAt.toISOString()
  };
}

function request(token) {
  return { headers: token ? { cookie: `sid=${token}` } : {} };
}

function updates(client) {
  return client.queries.filter((entry) => /^\s*UPDATE/i.test(entry.text));
}

test("свежая сессия не продлевается — лишней записи в базу нет", async () => {
  const client = fakeClient(sessionRow(new Date(Date.now() + SESSION_TTL_MS)));
  const req = request("token-fresh");

  const user = await loadUserFromRequest(client, req);

  assert.equal(user.id, 7);
  assert.deepEqual(updates(client), []);
  assert.equal(req.renewedSessionCookie, undefined);
});

test("сессия старше порога продлевается и отдаёт куку роутеру", async () => {
  const spent = SESSION_RENEW_AFTER_MS + 1000;
  const client = fakeClient(sessionRow(new Date(Date.now() + SESSION_TTL_MS - spent)));
  const req = request("token-stale");

  const user = await loadUserFromRequest(client, req);

  assert.equal(user.id, 7);
  const [extension] = updates(client);
  assert.ok(extension, "истёкший порог должен вызывать UPDATE sessions");
  assert.equal(extension.params[0], "token-stale");
  const newExpiry = new Date(extension.params[1]).getTime();
  assert.ok(newExpiry > Date.now() + SESSION_TTL_MS - 60_000);
  assert.match(req.renewedSessionCookie, /^sid=token-stale;/);
  assert.match(req.renewedSessionCookie, new RegExp(`Max-Age=${SESSION_TTL_MS / 1000}`));
});

test("запрос без куки не ходит в базу и не продлевает ничего", async () => {
  const client = fakeClient(sessionRow(new Date(Date.now() + SESSION_TTL_MS)));
  const req = request(null);

  assert.equal(await loadUserFromRequest(client, req), null);
  assert.deepEqual(client.queries, []);
  assert.equal(req.renewedSessionCookie, undefined);
});

test("истёкшая сессия не воскресает продлением", async () => {
  const client = fakeClient(null);
  const req = request("token-dead");

  assert.equal(await loadUserFromRequest(client, req), null);
  assert.deepEqual(updates(client), []);
  assert.equal(req.renewedSessionCookie, undefined);
});
