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

test("лидерборды независимо сортируются по TTS и IRL рейтингу", async () => {
  await usersRepo.setRating(client, alpha.id, 800, "irl");
  await usersRepo.setRating(client, bravo.id, 1300, "irl");

  const tts = await api.list({ client, query: new URLSearchParams("venue=tts") });
  const irl = await api.list({ client, query: new URLSearchParams("venue=irl") });

  assert.deepEqual(tts.users.map((user) => user.name), ["Alpha", "Bravo"]);
  assert.deepEqual(irl.users.map((user) => user.name), ["Bravo", "Alpha"]);
  assert.deepEqual(irl.users[0].ratings, { tts: 900, irl: 1300, combined: 900 });
  assert.equal(irl.users[0].rating, 1300);
});

test("Combined MMR сортируется независимо и используется по умолчанию", async () => {
  await usersRepo.setRating(client, alpha.id, 750, "combined");
  await usersRepo.setRating(client, bravo.id, 1400, "combined");

  const combined = await api.list({ client, query: new URLSearchParams("venue=combined") });
  const defaultList = await api.list({ client });

  assert.deepEqual(combined.users.map((user) => user.name), ["Bravo", "Alpha"]);
  assert.deepEqual(defaultList.users.map((user) => user.name), ["Bravo", "Alpha"]);
  assert.equal(combined.users[0].rating, 1400);
  assert.equal(combined.users[0].ratings.combined, 1400);
});

test("РЕГРЕСС B1: список не содержит контактов", async () => {
  const result = await api.list({ client });
  const serialized = JSON.stringify(result);

  assert.ok(!serialized.includes("@alpha"), "Telegram не должен уезжать анониму");
  assert.ok(!serialized.includes("AlphaNick"), "ник не должен уезжать анониму");
  assert.deepEqual(
    Object.keys(result.users[0]).sort(),
    ["avatarUrl", "id", "isAdmin", "name", "rating", "ratings"]
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

// A 1x1 PNG. Small, but the shape is what matters: a stored data URL comes back
// out as bytes, and nothing but this route ever ships it.
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

test("аватар отдаётся отдельным ресурсом, а не встраивается в JSON", async () => {
  const stored = await usersRepo.updateProfile(client, alpha.id, { avatarData: PIXEL });
  assert.match(stored.avatarUrl, /^\/api\/users\/\d+\/avatar\?v=[0-9a-f]{16}$/);

  const listed = await api.list({ client });
  const row = listed.users.find((item) => item.id === alpha.id);
  assert.equal(row.avatarUrl, stored.avatarUrl);
  // The point of the whole change: no response that mentions a player may carry
  // the picture. It used to repeat once per mention.
  assert.doesNotMatch(JSON.stringify(listed), /data:image/);

  const version = new URL(stored.avatarUrl, "http://x").searchParams.get("v");
  const served = await api.avatar({ client, params: { id: String(alpha.id) }, req: { url: stored.avatarUrl, headers: {} } });
  assert.equal(served.contentType, "image/png");
  assert.ok(served.buffer.equals(Buffer.from(PIXEL.split(",")[1], "base64")));
  assert.equal(served.headers.ETag, `"${version}"`);
  assert.equal(served.headers["Cache-Control"], "public, max-age=604800, immutable");

  const revalidated = await api.avatar({
    client,
    params: { id: String(alpha.id) },
    req: { url: stored.avatarUrl, headers: { "if-none-match": served.headers.ETag } }
  });
  assert.equal(revalidated.status, 304);
  assert.equal(revalidated.buffer, null);
});

test("ссылка на аватар меняется при замене картинки и исчезает при удалении", async () => {
  const first = (await usersRepo.updateProfile(client, alpha.id, { avatarData: PIXEL })).avatarUrl;
  const other = `data:image/png;base64,${Buffer.from("second").toString("base64")}`;
  const second = (await usersRepo.updateProfile(client, alpha.id, { avatarData: other })).avatarUrl;
  assert.notEqual(second, first);

  const cleared = await usersRepo.updateProfile(client, alpha.id, { avatarData: null });
  assert.equal(cleared.avatarUrl, null);
  await assert.rejects(
    api.avatar({ client, params: { id: String(alpha.id) }, req: { url: "", headers: {} } }),
    /no avatar/
  );
});

test("аватар неизвестного игрока даёт 404, а не пустой ответ", async () => {
  await assert.rejects(
    api.avatar({ client, params: { id: "999999" }, req: { url: "", headers: {} } }),
    /no avatar/
  );
  await assert.rejects(
    api.avatar({ client, params: { id: "0" }, req: { url: "", headers: {} } }),
    /not found/i
  );
});
