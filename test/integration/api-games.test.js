const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const api = require("../../src/api/games");
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

function scores(winnerId, loserId) {
  return {
    [winnerId]: { crit: 6, kill: 4, tac: 5, primary: "crit", faction: "Kasrkin", tacOp: "" },
    [loserId]: { crit: 2, kill: 3, tac: 1, primary: "kill", faction: "Legionaries", tacOp: "" }
  };
}

async function openGame() {
  return gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
}

test("игра загружается отдельно по id", async () => {
  const game = await openGame();

  const result = await api.getOne({
    client, user: alpha, params: { id: String(game.id) }
  });

  assert.equal(result.game.id, game.id);
  assert.deepEqual(result.game.players.map((player) => player.id), [alpha.id, bravo.id]);
});

test("посторонний не может открыть незавершённую игру по id", async () => {
  const game = await openGame();
  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });

  await assert.rejects(
    () => api.getOne({ client, user: charlie, params: { id: String(game.id) } }),
    (err) => err.status === 403
  );
});

async function withOwnTransaction(fn) {
  const own = await pool.connect();
  try {
    await own.query("BEGIN");
    const result = await fn(own);
    await own.query("COMMIT");
    return result;
  } catch (err) {
    await own.query("ROLLBACK");
    throw err;
  } finally {
    own.release();
  }
}

test("отправка результата переводит игру в ожидание подтверждения", async () => {
  const game = await openGame();
  const result = await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  assert.equal(result.game.status, "pending_confirmation");
  assert.equal(result.game.pendingResult.submittedBy, alpha.id);
  assert.equal(result.game.pendingResult.result.winnerId, alpha.id);
  assert.equal(result.game.result, null);
});

test("посторонний не может отправить результат", async () => {
  const game = await openGame();
  const charlie = await usersRepo.insert(client, {
    name: "Charlie", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });

  await assert.rejects(
    () => api.submitResult({
      client, user: charlie, params: { id: String(game.id) },
      body: { scores: scores(alpha.id, bravo.id) }
    }),
    (err) => err.status === 403
  );
});

test("нечисловой id игры отдаёт 404, а не 500", async () => {
  await assert.rejects(
    () => api.submitResult({
      client, user: alpha, params: { id: "abc" },
      body: { scores: scores(alpha.id, bravo.id) }
    }),
    (err) => err.status === 404
  );
});

test("подтверждение начисляет Elo обоим игрокам", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  const confirmed = await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  assert.equal(confirmed.game.status, "completed");
  assert.equal(confirmed.game.elo[alpha.id].delta, 16);
  assert.equal(confirmed.game.elo[bravo.id].delta, -16);
  assert.equal(confirmed.game.elo.combined[alpha.id].delta, 16);
  assert.equal(confirmed.game.elo.combined[bravo.id].delta, -16);
  const updatedAlpha = await usersRepo.findById(client, alpha.id);
  const updatedBravo = await usersRepo.findById(client, bravo.id);
  assert.equal(updatedAlpha.rating, 1016);
  assert.equal(updatedBravo.rating, 984);
  assert.equal(updatedAlpha.ratings.combined, 1016);
  assert.equal(updatedBravo.ratings.combined, 984);
});

test("отправитель не может подтвердить свой же результат", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  await assert.rejects(
    () => api.respondToResult({
      client, user: alpha, params: { id: String(game.id), action: "confirm-result" }
    }),
    (err) => err.status === 403
  );
});

test("отклонение возвращает игру в открытое состояние", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  const rejected = await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "reject-result" }
  });

  assert.equal(rejected.game.status, "open");
  assert.equal(rejected.game.pendingResult, null);
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
});

test("повторное сохранение завершённой игры отклоняется", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });
  await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  await assert.rejects(
    () => api.submitResult({
      client, user: alpha, params: { id: String(game.id) },
      body: { scores: scores(alpha.id, bravo.id) }
    }),
    (err) => err.status === 409
  );
});

test("РЕГРЕСС A1: параллельное подтверждение применяет Elo ровно один раз", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  const confirm = () =>
    withOwnTransaction((own) =>
      api.respondToResult({
        client: own,
        user: bravo,
        params: { id: String(game.id), action: "confirm-result" }
      })
    );

  const outcomes = await Promise.allSettled([confirm(), confirm()]);
  const fulfilled = outcomes.filter((item) => item.status === "fulfilled");
  const rejected = outcomes.filter((item) => item.status === "rejected");

  assert.equal(fulfilled.length, 1, "подтвердиться должен ровно один запрос");
  assert.equal(rejected.length, 1, "второй запрос должен получить отказ");
  assert.equal(rejected[0].reason.status, 409);

  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, bravo.id)).rating, 984);
});

test("РЕГРЕСС A1: параллельная отправка результата не задваивается", async () => {
  const game = await openGame();

  const submit = (user) =>
    withOwnTransaction((own) =>
      api.submitResult({
        client: own, user, params: { id: String(game.id) },
        body: { scores: scores(alpha.id, bravo.id) }
      })
    );

  const outcomes = await Promise.allSettled([submit(alpha), submit(bravo)]);
  const fulfilled = outcomes.filter((item) => item.status === "fulfilled");
  assert.equal(fulfilled.length, 1, "принять надо только одну отправку");

  const stored = await gamesRepo.findById(client, game.id);
  assert.equal(stored.status, "pending_confirmation");
});

test("выход из игры отменяет её без начисления Elo", async () => {
  const game = await openGame();
  const exited = await api.exitGame({
    client, user: alpha, params: { id: String(game.id) }
  });

  assert.equal(exited.game.status, "cancelled");
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1000);
});

test("выйти из завершённой игры нельзя", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });
  await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  await assert.rejects(
    () => api.exitGame({ client, user: alpha, params: { id: String(game.id) } }),
    (err) => err.status === 409
  );
});

test("ожидающую игру может удалить только отправивший результат", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });

  await assert.rejects(
    () => api.exitGame({ client, user: bravo, params: { id: String(game.id) } }),
    (err) => err.status === 403
  );
});

test("HIGH 1: устаревший pending_result с пустой фракцией всё ещё можно подтвердить", async () => {
  const game = await openGame();

  // Simulates data written before validation existed (server.js's
  // resultKillTeamInput tolerated blank input): store the pending result
  // directly via the repository, bypassing submitResult's own validation,
  // with alpha's faction left empty.
  const legacyScores = scores(alpha.id, bravo.id);
  legacyScores[alpha.id] = { ...legacyScores[alpha.id], faction: "" };
  await gamesRepo.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: {
      submittedBy: alpha.id,
      submittedAt: new Date().toISOString(),
      result: { winnerId: alpha.id, scores: legacyScores, killzone: null, tiebreakers: null }
    }
  });

  const confirmed = await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  assert.equal(confirmed.game.status, "completed");
  assert.equal(confirmed.game.result.scores[alpha.id].faction, "");
});

test("список завершённых игр содержит игроков", async () => {
  const game = await openGame();
  await api.submitResult({
    client, user: alpha, params: { id: String(game.id) },
    body: { scores: scores(alpha.id, bravo.id) }
  });
  await api.respondToResult({
    client, user: bravo, params: { id: String(game.id), action: "confirm-result" }
  });

  const list = await api.listCompleted({ client });
  assert.equal(list.games.length, 1);
  assert.equal(list.games[0].players.length, 2);
  assert.equal("challengeCredits" in list.games[0].players[0], false);
});

test("список завершённых игр фильтруется по площадке", async () => {
  const ttsGame = await gamesRepo.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const irlGame = await gamesRepo.insert(client, {
    challengeId: null,
    playerIds: [alpha.id, bravo.id],
    venueMode: "irl"
  });
  for (const game of [ttsGame, irlGame]) {
    await gamesRepo.saveFinalResult(client, game.id, {
      result: { winnerId: alpha.id, scores: scores(alpha.id, bravo.id) },
      elo: {}
    });
  }

  const tts = await api.listCompleted({ client, query: new URLSearchParams("venue=tts") });
  const irl = await api.listCompleted({ client, query: new URLSearchParams("venue=irl") });

  assert.deepEqual(tts.games.map((game) => game.id), [ttsGame.id]);
  assert.deepEqual(irl.games.map((game) => game.id), [irlGame.id]);
  assert.equal(irl.games[0].venueMode, "irl");
});

test("game history pages contain 25 games and filters search beyond the loaded page", async () => {
  const charlie = await usersRepo.insert(client, {
    name: "Чарли-Тест", passwordHash: "s:h", registerNickname: "", telegramContact: "@c",
    rating: 1000, isAdmin: false
  });
  const ids = [];
  for (let index = 0; index < 52; index++) {
    const player = index < 2 ? charlie : alpha;
    const game = await gamesRepo.insert(client, {
      playerIds: [player.id, bravo.id], venueMode: index < 2 ? "irl" : "tts"
    });
    const resultScores = scores(player.id, bravo.id);
    if (index < 3) resultScores[player.id].faction = "Imperial Navy Breachers";
    await gamesRepo.saveFinalResult(client, game.id, {
      result: { winnerId: player.id, scores: resultScores }, elo: {}
    });
    ids.push(game.id);
  }
  await openGame(); // Active games must not affect page counts.
  await client.query("UPDATE games SET submitted_at = '2026-09-28T12:00:00Z' WHERE status = 'completed'");
  const list = (params) => api.listCompleted({ client, query: new URLSearchParams(params) });
  const first = await list({ page: 1 });
  const second = await list({ page: 2 });
  const last = await list({ page: 999 });
  assert.deepEqual(first.pagination, { currentPage: 1, totalPages: 3, total: 52, pageSize: 25, start: 0, end: 25 });
  assert.equal(second.games.length, 25);
  assert.equal(last.pagination.currentPage, 3);
  assert.equal(last.games.length, 2);
  assert.deepEqual([...first.games, ...second.games, ...last.games].map(game => game.id), [...ids].reverse());
  assert.equal((await api.listCompleted({ client })).games.length, 52, "statistics still loads every completed game");

  const searched = await list({ page: 1, playerQuery: "чАрЛи тЕст" });
  assert.equal(searched.totalCompleted, 52);
  assert.deepEqual(searched.games.map(game => game.id), ids.slice(0, 2).reverse());
  assert.deepEqual(searched.players, [{ id: charlie.id, name: charlie.name, games: 2 }]);
  const selected = await list({ page: 1, playerId: charlie.id, team: "Navy Breachers", venue: "irl" });
  assert.equal(selected.pagination.total, 2);
  const faction = await list({ page: 1, team: "Navy Breachers" });
  assert.equal(faction.pagination.total, 3, "legacy faction aliases remain searchable");
  const empty = await list({ page: 2, playerQuery: "No such player" });
  assert.equal(empty.games.length, 0);
  assert.deepEqual(empty.pagination, { currentPage: 1, totalPages: 1, total: 0, pageSize: 25, start: 0, end: 0 });
});

test("invalid game history page and player filters return 400", async () => {
  for (const params of [{ page: 0 }, { page: -1 }, { page: 1.5 }, { page: "abc" },
    { page: Number.MAX_SAFE_INTEGER + 1 }, { page: 1, playerId: "abc" }, { page: 1, playerId: 2147483648 }]) {
    await assert.rejects(() => api.listCompleted({ client, query: new URLSearchParams(params) }), err => err.status === 400);
  }
});
