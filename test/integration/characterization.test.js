const test = require("node:test");
const assert = require("node:assert/strict");

const { TEST_DATABASE_URL, resetDatabase, closeTestPool } = require("../helpers/db");

process.env.DATABASE_URL = TEST_DATABASE_URL;

const { getPool, withClient, withTransaction } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const routes = require("../../src/api/routes");
const { loadUserFromRequest } = require("../../src/api/auth");
const { startApiServer, createClient } = require("../helpers/client");

let server;

test.before(async () => {
  await migrate(getPool());
  const router = createRouter(routes, {
    withClient,
    withTransaction,
    loadUser: loadUserFromRequest
  });
  server = await startApiServer(router);
});

test.after(async () => {
  await server.close();
  await closeTestPool();
});

test.beforeEach(async () => {
  await resetDatabase();
});

function registration(name, overrides = {}) {
  return {
    name,
    password: "password123",
    confirmPassword: "password123",
    telegramContact: `@${name.toLowerCase()}`,
    registerNickname: name,
    ...overrides
  };
}

function approvedOps(faction, { crit, kill, tac, primary }) {
  return { crit, kill, tac, primary, faction, tacOp: "" };
}

test("первый зарегистрированный становится администратором", async () => {
  const client = createClient(server.baseUrl);
  const res = await client.post("/api/register", registration("Alpha"));

  assert.equal(res.status, 201);
  assert.equal(res.body.user.name, "Alpha");
  assert.equal(res.body.user.isAdmin, true);
  assert.equal(res.body.user.rating, 1000);
  assert.equal(res.body.hasAdmin, true);
});

test("второй зарегистрированный администратором не становится", async () => {
  const first = createClient(server.baseUrl);
  await first.post("/api/register", registration("Alpha"));

  const second = createClient(server.baseUrl);
  const res = await second.post("/api/register", registration("Bravo"));

  assert.equal(res.status, 201);
  assert.equal(res.body.user.isAdmin, false);
});

test("повторное имя отклоняется с 409", async () => {
  const client = createClient(server.baseUrl);
  await client.post("/api/register", registration("Alpha"));

  const other = createClient(server.baseUrl);
  const res = await other.post("/api/register", registration("alpha"));

  assert.equal(res.status, 409);
});

test("вход по неверному паролю отдаёт 401", async () => {
  const client = createClient(server.baseUrl);
  await client.post("/api/register", registration("Alpha"));
  client.clearCookie();

  const res = await client.post("/api/login", { name: "Alpha", password: "wrong" });
  assert.equal(res.status, 401);
});

test("защищённый маршрут без сессии отдаёт 401", async () => {
  const client = createClient(server.baseUrl);
  const res = await client.get("/api/games");
  assert.equal(res.status, 401);
});

test("сквозной сценарий: челлендж, результат, подтверждение, Elo", async () => {
  const alpha = createClient(server.baseUrl);
  const bravo = createClient(server.baseUrl);

  const alphaRes = await alpha.post("/api/register", registration("Alpha"));
  const bravoRes = await bravo.post("/api/register", registration("Bravo"));
  const alphaId = alphaRes.body.user.id;
  const bravoId = bravoRes.body.user.id;

  const challenge = await alpha.post("/api/challenges", { toUserId: bravoId });
  assert.equal(challenge.status, 201);
  assert.equal(challenge.body.challenge.status, "pending");

  const accepted = await bravo.post(`/api/challenges/${challenge.body.challenge.id}/accept`);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.challenge.status, "accepted");

  const gameId = accepted.body.challenge.gameId;
  assert.ok(gameId);

  const submitted = await alpha.post(`/api/games/${gameId}/result`, {
    scores: {
      [alphaId]: approvedOps("Kasrkin", { crit: 6, kill: 4, tac: 5, primary: "crit" }),
      [bravoId]: approvedOps("Legionaries", { crit: 2, kill: 3, tac: 1, primary: "kill" })
    }
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.game.status, "pending_confirmation");

  const confirmed = await bravo.post(`/api/games/${gameId}/confirm-result`);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.game.status, "completed");
  assert.equal(confirmed.body.game.result.winnerId, alphaId);

  // Alpha: 6 + 4 + 5 + ceil(6/2) = 18. Bravo: 2 + 3 + 1 + ceil(3/2) = 8.
  assert.equal(confirmed.body.game.result.scores[alphaId].total, 18);
  assert.equal(confirmed.body.game.result.scores[bravoId].total, 8);

  // При равных рейтингах ожидание 0.5, дельта = round(32 * 0.5) = 16.
  assert.equal(confirmed.body.game.elo[alphaId].delta, 16);
  assert.equal(confirmed.body.game.elo[bravoId].delta, -16);

  const leaderboard = await alpha.get("/api/users");
  const alphaRow = leaderboard.body.users.find((user) => user.id === alphaId);
  const bravoRow = leaderboard.body.users.find((user) => user.id === bravoId);
  assert.equal(alphaRow.rating, 1016);
  assert.equal(bravoRow.rating, 984);
});

test("отправитель результата не может подтвердить его сам", async () => {
  const alpha = createClient(server.baseUrl);
  const bravo = createClient(server.baseUrl);
  const alphaId = (await alpha.post("/api/register", registration("Alpha"))).body.user.id;
  const bravoId = (await bravo.post("/api/register", registration("Bravo"))).body.user.id;

  const challenge = await alpha.post("/api/challenges", { toUserId: bravoId });
  const accepted = await bravo.post(`/api/challenges/${challenge.body.challenge.id}/accept`);
  const gameId = accepted.body.challenge.gameId;

  await alpha.post(`/api/games/${gameId}/result`, {
    scores: {
      [alphaId]: approvedOps("Kasrkin", { crit: 3, kill: 3, tac: 3, primary: "crit" }),
      [bravoId]: approvedOps("Legionaries", { crit: 1, kill: 1, tac: 1, primary: "kill" })
    }
  });

  const res = await alpha.post(`/api/games/${gameId}/confirm-result`);
  assert.equal(res.status, 403);
});

test("недопустимый Kill Team отклоняется", async () => {
  const alpha = createClient(server.baseUrl);
  const bravo = createClient(server.baseUrl);
  const alphaId = (await alpha.post("/api/register", registration("Alpha"))).body.user.id;
  const bravoId = (await bravo.post("/api/register", registration("Bravo"))).body.user.id;

  const challenge = await alpha.post("/api/challenges", { toUserId: bravoId });
  const accepted = await bravo.post(`/api/challenges/${challenge.body.challenge.id}/accept`);
  const gameId = accepted.body.challenge.gameId;

  const res = await alpha.post(`/api/games/${gameId}/result`, {
    scores: {
      [alphaId]: approvedOps("Not A Real Team", { crit: 3, kill: 3, tac: 3, primary: "crit" }),
      [bravoId]: approvedOps("Legionaries", { crit: 1, kill: 1, tac: 1, primary: "kill" })
    }
  });
  assert.equal(res.status, 400);
});

test("неизвестный маршрут отдаёт 404", async () => {
  const client = createClient(server.baseUrl);
  const res = await client.get("/api/nope");
  assert.equal(res.status, 404);
});

test("КОНТРАКТ B1: лидерборд не отдаёт контакты анониму", async () => {
  const alpha = createClient(server.baseUrl);
  await alpha.post("/api/register", registration("Alpha"));

  const anonymous = createClient(server.baseUrl);
  const res = await anonymous.get("/api/users");

  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes("@alpha"));
  assert.deepEqual(
    Object.keys(res.body.users[0]).sort(),
    ["avatarData", "id", "isAdmin", "name", "rating"]
  );
});

test("КОНТРАКТ D5: поиск без совпадений отдаёт 200 и пустой список", async () => {
  const alpha = createClient(server.baseUrl);
  await alpha.post("/api/register", registration("Alpha"));

  const res = await alpha.get("/api/users/search?q=ghost");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.users, []);
});
