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
  assert.equal((await usersRepo.findById(client, alpha.id)).rating, 1016);
  assert.equal((await usersRepo.findById(client, bravo.id)).rating, 984);
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
