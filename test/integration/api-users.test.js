const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const api = require("../../src/api/users");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");

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
    name: "Alpha", passwordHash: "s:h", registerNickname: "AlphaNick",
    telegramContact: "@alpha", rating: 1200, isAdmin: true
  });
  bravo = await usersRepo.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "BravoNick",
    telegramContact: "@bravo", rating: 900, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

test("список отсортирован по рейтингу", async () => {
  const result = await api.list({ client });
  assert.deepEqual(result.users.map((user) => user.name), ["Alpha", "Bravo"]);
});

test("РЕГРЕСС B1: список не содержит контактов", async () => {
  const result = await api.list({ client });
  const serialized = JSON.stringify(result);

  assert.ok(!serialized.includes("@alpha"), "Telegram не должен уезжать анониму");
  assert.ok(!serialized.includes("AlphaNick"), "ник не должен уезжать анониму");
  assert.deepEqual(
    Object.keys(result.users[0]).sort(),
    ["avatarData", "id", "isAdmin", "name", "rating"]
  );
});

test("РЕГРЕСС D5: поиск без совпадений отдаёт 200 и пустой список", async () => {
  const result = await api.search({ client, user: alpha, query: new URLSearchParams("q=ghost") });
  assert.deepEqual(result, { users: [] });
});

test("поиск находит по нику и телеграму и не возвращает самого себя", async () => {
  const byNick = await api.search({
    client, user: alpha, query: new URLSearchParams("q=bravonick")
  });
  assert.deepEqual(byNick.users.map((user) => user.name), ["Bravo"]);

  const byTelegram = await api.search({
    client, user: alpha, query: new URLSearchParams("q=@bravo")
  });
  assert.deepEqual(byTelegram.users.map((user) => user.name), ["Bravo"]);

  const all = await api.search({ client, user: alpha, query: new URLSearchParams("q=") });
  assert.equal(all.users.some((user) => user.id === alpha.id), false);
});

test("поиск сохраняет контакты для авторизованного вызова", async () => {
  const result = await api.search({
    client, user: alpha, query: new URLSearchParams("q=bravo")
  });
  assert.equal(result.users[0].telegramContact, "@bravo");
});

test("профиль считает статистику по завершённым играм", async () => {
  const first = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const second = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });

  await gamesRepo.saveFinalResult(client, first.id, {
    result: { winnerId: alpha.id, scores: { [alpha.id]: { faction: "Kasrkin" } } },
    elo: { [alpha.id]: { delta: 16 }, [bravo.id]: { delta: -16 } }
  });
  await gamesRepo.saveFinalResult(client, second.id, {
    result: { winnerId: bravo.id, scores: {} },
    elo: { [alpha.id]: { delta: -14 }, [bravo.id]: { delta: 14 } }
  });

  const result = await api.profile({ client, user: alpha, params: { id: String(alpha.id) } });

  assert.equal(result.stats.matches, 2);
  assert.equal(result.stats.wins, 1);
  assert.equal(result.stats.losses, 1);
  assert.equal(result.stats.draws, 0);
  assert.equal(result.stats.winRate, 50);
  assert.equal(result.stats.eloDelta, 2);
});

test("профиль считает статистику при смешанном исходе (победа/поражение/ничья)", async () => {
  const first = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const second = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const third = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });

  await gamesRepo.saveFinalResult(client, first.id, {
    result: { winnerId: alpha.id, scores: { [alpha.id]: { faction: "Kasrkin" } } },
    elo: { [alpha.id]: { delta: 16 }, [bravo.id]: { delta: -16 } }
  });
  await gamesRepo.saveFinalResult(client, second.id, {
    result: { winnerId: bravo.id, scores: {} },
    elo: { [alpha.id]: { delta: -14 }, [bravo.id]: { delta: 14 } }
  });
  await gamesRepo.saveFinalResult(client, third.id, {
    result: { winnerId: null, scores: {} },
    elo: { [alpha.id]: { delta: 5 }, [bravo.id]: { delta: -5 } }
  });

  const result = await api.profile({ client, user: alpha, params: { id: String(alpha.id) } });

  // By hand: matches=3 (1 win, 1 loss, 1 draw); winRate = round(1/3*100) = 33;
  // eloDelta = 16 + (-14) + 5 = 7.
  assert.equal(result.stats.matches, 3);
  assert.equal(result.stats.wins, 1);
  assert.equal(result.stats.losses, 1);
  assert.equal(result.stats.draws, 1);
  assert.equal(result.stats.winRate, 33);
  assert.equal(result.stats.eloDelta, 7);
});

test("профиль отражает прогресс по challenge-треку", async () => {
  const game = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await gamesRepo.saveFinalResult(client, game.id, {
    result: { winnerId: alpha.id, scores: { [alpha.id]: { faction: "Kasrkin" } } },
    elo: {}
  });

  const result = await api.profile({ client, user: alpha, params: { id: String(alpha.id) } });
  assert.equal(result.challengeProgress.completedCount, 1);
  assert.equal(result.challengeProgress.teams[0].status, "completed");
});

test("несуществующий профиль отдаёт 404", async () => {
  await assert.rejects(
    () => api.profile({ client, user: alpha, params: { id: "9999" } }),
    (err) => err.status === 404
  );
});

test("обычный пользователь не видит чужие ожидающие игры", async () => {
  const game = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await gamesRepo.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: { submittedBy: alpha.id, submittedAt: "2026-01-01T00:00:00.000Z", result: {} }
  });

  const asAdmin = await api.profile({ client, user: alpha, params: { id: String(bravo.id) } });
  assert.equal(asAdmin.pendingGames.length, 1);

  const asPlayer = await api.profile({ client, user: bravo, params: { id: String(alpha.id) } });
  assert.equal(asPlayer.pendingGames.length, 0);
});

test("challengeProgress отдаёт справочники треков", async () => {
  const result = await api.challengeProgress({
    client, user: alpha, query: new URLSearchParams("")
  });

  assert.ok(Array.isArray(result.teams));
  assert.ok(Array.isArray(result.wildcards));
  assert.ok(Array.isArray(result.allKillTeamTeams));
  assert.equal(result.users.length, 1);
  assert.equal(result.users[0].user.id, alpha.id);
});

test("challengeProgress умеет отдавать прогресс другого игрока", async () => {
  const result = await api.challengeProgress({
    client, user: alpha, query: new URLSearchParams(`userId=${bravo.id}`)
  });
  assert.equal(result.users[0].user.id, bravo.id);

  await assert.rejects(
    () => api.challengeProgress({ client, user: alpha, query: new URLSearchParams("userId=9999") }),
    (err) => err.status === 404
  );
});

test("нечисловой id профиля отдаёт 404, а не 500", async () => {
  await assert.rejects(
    () => api.profile({ client, user: alpha, params: { id: "abc" } }),
    (err) => err.status === 404
  );
});

test("нечисловой userId в challengeProgress отдаёт 404, а не 500", async () => {
  await assert.rejects(
    () => api.challengeProgress({ client, user: alpha, query: new URLSearchParams("userId=abc") }),
    (err) => err.status === 404
  );
});
