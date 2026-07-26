const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const api = require("../../src/api/challenges");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");
const challengesRepo = require("../../src/db/repositories/challenges");

let pool;
let client;
let alpha;
let bravo;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE sessions, feedback, games, challenges, users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  alpha = await usersRepo.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "", telegramContact: "@a",
    rating: 1000, isAdmin: false
  });
  bravo = await usersRepo.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "", telegramContact: "@b",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

test("создание челленджа отдаёт 201 и share-токен", async () => {
  const result = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });

  assert.equal(result.status, 201);
  assert.equal(result.body.challenge.status, "pending");
  assert.equal(result.body.challenge.from.id, alpha.id);
  assert.equal(result.body.challenge.to.id, bravo.id);
  assert.match(result.body.challenge.shareToken, /^[a-f0-9]{36}$/);
});

test("нельзя вызвать себя или несуществующего игрока", async () => {
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: alpha.id } }),
    (err) => err.status === 400
  );
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: 9999 } }),
    (err) => err.status === 400
  );
});

test("повторный челлендж той же паре отклоняется", async () => {
  await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  await assert.rejects(
    () => api.create({ client, user: bravo, body: { toUserId: alpha.id } }),
    (err) => err.status === 409
  );
});

test("челлендж поверх активной игры отклоняется", async () => {
  await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: bravo.id } }),
    (err) => err.status === 409
  );
});

test("принятие создаёт игру и связывает её с челленджем", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const id = String(created.body.challenge.id);

  const accepted = await api.respond({
    client, user: bravo, params: { id, action: "accept" }
  });

  assert.equal(accepted.challenge.status, "accepted");
  assert.ok(accepted.challenge.gameId);

  const game = await gamesRepo.findById(client, accepted.challenge.gameId);
  assert.equal(game.status, "open");
  assert.deepEqual(game.playerIds.sort(), [alpha.id, bravo.id].sort());
});

test("принять может только получатель, отменить — только отправитель", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const id = String(created.body.challenge.id);

  await assert.rejects(
    () => api.respond({ client, user: alpha, params: { id, action: "accept" } }),
    (err) => err.status === 403
  );
  await assert.rejects(
    () => api.respond({ client, user: bravo, params: { id, action: "cancel" } }),
    (err) => err.status === 403
  );

  const cancelled = await api.respond({ client, user: alpha, params: { id, action: "cancel" } });
  assert.equal(cancelled.challenge.status, "cancelled");
});

test("отклонение переводит челлендж в declined", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const declined = await api.respond({
    client, user: bravo, params: { id: String(created.body.challenge.id), action: "decline" }
  });
  assert.equal(declined.challenge.status, "declined");
});

test("повторный ответ на обработанный челлендж отклоняется", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const id = String(created.body.challenge.id);
  await api.respond({ client, user: bravo, params: { id, action: "decline" } });

  await assert.rejects(
    () => api.respond({ client, user: bravo, params: { id, action: "accept" } }),
    (err) => err.status === 409
  );
});

test("несуществующий челлендж отдаёт 404", async () => {
  await assert.rejects(
    () => api.respond({ client, user: bravo, params: { id: "9999", action: "accept" } }),
    (err) => err.status === 404
  );
});

test("share-ссылка доступна только участникам", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const token = created.body.challenge.shareToken;

  const seen = await api.byShareToken({ client, user: bravo, params: { token } });
  assert.equal(seen.challenge.id, created.body.challenge.id);

  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });
  await assert.rejects(
    () => api.byShareToken({ client, user: charlie, params: { token } }),
    (err) => err.status === 403
  );
});

test("принятие по share-ссылке доступно только получателю", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const token = created.body.challenge.shareToken;

  await assert.rejects(
    () => api.acceptByShareToken({ client, user: alpha, params: { token } }),
    (err) => err.status === 403
  );

  const accepted = await api.acceptByShareToken({ client, user: bravo, params: { token } });
  assert.equal(accepted.challenge.status, "accepted");
  assert.equal(accepted.game.status, "open");
});

test("неизвестный share-токен отдаёт 404", async () => {
  await assert.rejects(
    () => api.byShareToken({ client, user: alpha, params: { token: "f".repeat(36) } }),
    (err) => err.status === 404
  );
});

test("share-токены уникальны", async () => {
  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });
  const first = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const second = await api.create({ client, user: alpha, body: { toUserId: charlie.id } });
  assert.notEqual(first.body.challenge.shareToken, second.body.challenge.shareToken);
});

test("нечисловой toUserId отдаёт 400, а не 500", async () => {
  await assert.rejects(
    () => api.create({ client, user: alpha, body: { toUserId: "abc" } }),
    (err) => err.status === 400 && err.message === "Challenge target user not found"
  );
});

test("отсутствующий toUserId отдаёт 400, а не 500", async () => {
  await assert.rejects(
    () => api.create({ client, user: alpha, body: {} }),
    (err) => err.status === 400 && err.message === "Challenge target user not found"
  );
});

test("нечисловой id в respond отдаёт 404, а не 500", async () => {
  await assert.rejects(
    () => api.respond({ client, user: alpha, params: { id: "abc", action: "accept" } }),
    (err) => err.status === 404
  );
});

test("посторонний с валидным share-токеном на обработанном челлендже получает 409, а не 403", async () => {
  const created = await api.create({ client, user: alpha, body: { toUserId: bravo.id } });
  const token = created.body.challenge.shareToken;
  await api.respond({
    client, user: bravo, params: { id: String(created.body.challenge.id), action: "decline" }
  });

  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });

  await assert.rejects(
    () => api.acceptByShareToken({ client, user: charlie, params: { token } }),
    (err) => err.status === 409 && err.message === "This challenge has already been handled"
  );
});
