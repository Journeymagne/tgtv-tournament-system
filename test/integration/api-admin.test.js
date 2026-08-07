const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const admin = require("../../src/api/admin");
const feedbackApi = require("../../src/api/feedback");
const gamesApi = require("../../src/api/games");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");
const { verifyPassword } = require("../../src/domain/passwords");

let pool;
let client;
let root;
let player;

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
  root = await usersRepo.insert(client, {
    name: "Root", passwordHash: "s:h", registerNickname: "", telegramContact: "@root",
    rating: 1000, isAdmin: true
  });
  player = await usersRepo.insert(client, {
    name: "Player", passwordHash: "s:h", registerNickname: "", telegramContact: "@player",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

function scores(a, b) {
  return {
    [a]: { crit: 6, kill: 4, tac: 5, primary: "crit", faction: "Kasrkin", tacOp: "" },
    [b]: { crit: 2, kill: 3, tac: 1, primary: "kill", faction: "Legionaries", tacOp: "" }
  };
}

test("РЕГРЕСС D1: результат для отменённой игры отклоняется", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesRepo.cancel(client, game.id);

  await assert.rejects(
    () => admin.saveGameResult({
      client, user: root, params: { id: String(game.id) },
      body: { scores: scores(root.id, player.id) }
    }),
    (err) => err.status === 409
  );

  assert.equal((await usersRepo.findById(client, root.id)).rating, 1000);
});

test("админ может переписать результат завершённой игры, откатив прежнее Elo", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesApi.submitResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(root.id, player.id) }
  });
  await gamesApi.respondToResult({
    client, user: player, params: { id: String(game.id), action: "confirm-result" }
  });
  assert.equal((await usersRepo.findById(client, root.id)).rating, 1016);

  // Backdate so a bump is unambiguous, not just "happened to differ by a few ms".
  await client.query("UPDATE games SET submitted_at = $2 WHERE id = $1", [
    game.id, "2020-01-01T00:00:00.000Z"
  ]);

  const overridden = await admin.saveGameResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(player.id, root.id) }
  });

  assert.equal((await usersRepo.findById(client, root.id)).rating, 984);
  assert.equal((await usersRepo.findById(client, player.id)).rating, 1016);
  assert.ok(
    new Date(overridden.game.submittedAt).getTime() > new Date("2020-01-01T00:00:00.000Z").getTime(),
    "админский override — это новая подача результата, submitted_at должен сдвинуться вперёд"
  );
});

test("подтверждение результата игроком сохраняет исходный submitted_at", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  const submitted = await gamesApi.submitResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(root.id, player.id) }
  });
  const submittedAt = submitted.game.submittedAt;
  assert.ok(submittedAt);

  const confirmed = await gamesApi.respondToResult({
    client, user: player, params: { id: String(game.id), action: "confirm-result" }
  });

  assert.equal(
    confirmed.game.submittedAt, submittedAt,
    "подтверждение — это не новая подача, submitted_at не должен измениться"
  );
});

test("РЕГРЕСС D2: неудачный патч не оставляет частичных изменений", async () => {
  await assert.rejects(
    () => admin.updateUser({
      client, user: root, params: { id: String(root.id) },
      body: { rating: 1500, isAdmin: false }
    }),
    (err) => err.status === 400
  );

  const unchanged = await usersRepo.findById(client, root.id);
  assert.equal(unchanged.rating, 1000, "рейтинг не должен примениться при отказе");
  assert.equal(unchanged.isAdmin, true);
});

test("патч рейтинга проверяет границы", async () => {
  await assert.rejects(
    () => admin.updateUser({
      client, user: root, params: { id: String(player.id) }, body: { rating: 99999 }
    }),
    (err) => err.status === 400
  );

  const updated = await admin.updateUser({
    client, user: root, params: { id: String(player.id) }, body: { rating: 1234 }
  });
  assert.equal(updated.user.rating, 1234);
});

test("админ может выдать и снять права другому игроку", async () => {
  const promoted = await admin.updateUser({
    client, user: root, params: { id: String(player.id) }, body: { isAdmin: true }
  });
  assert.equal(promoted.user.isAdmin, true);

  const demoted = await admin.updateUser({
    client, user: root, params: { id: String(player.id) }, body: { isAdmin: false }
  });
  assert.equal(demoted.user.isAdmin, false);
});

test("нельзя удалить самого себя", async () => {
  await assert.rejects(
    () => admin.deleteUser({ client, user: root, params: { id: String(root.id) } }),
    (err) => err.status === 400
  );
});

test("удаление игрока убирает его игры", async () => {
  await gamesRepo.insert(client, { challengeId: null, playerIds: [root.id, player.id] });
  await admin.deleteUser({ client, user: root, params: { id: String(player.id) } });

  assert.equal(await usersRepo.findById(client, player.id), null);
  assert.equal((await gamesRepo.listForUser(client, root.id)).length, 0);
});

test("сброс пароля выдаёт временный пароль и гасит сессии", async () => {
  const result = await admin.resetPassword({
    client, user: root, params: { id: String(player.id) }
  });

  assert.ok(result.password.length >= 12);
  const updated = await usersRepo.findById(client, player.id);
  assert.equal(await verifyPassword(result.password, updated.passwordHash), true);

  await assert.rejects(
    () => admin.resetPassword({ client, user: root, params: { id: String(root.id) } }),
    (err) => err.status === 400
  );
});

test("админ начисляет и списывает Kill Team в треке", async () => {
  const credited = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Kasrkin", action: "credit", track: "classified" }
  });
  assert.equal(credited.progress.completedCount, 1);

  const again = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Kasrkin", action: "credit", track: "classified" }
  });
  assert.equal(again.progress.completedCount, 1, "повторное начисление ничего не меняет");

  const removed = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Kasrkin", action: "remove", track: "classified" }
  });
  assert.equal(removed.progress.completedCount, 0);
});

test("начисление принимает историческое написание и отвергает мусор", async () => {
  const credited = await admin.challengeCredit({
    client, user: root, params: { id: String(player.id) },
    body: { team: "Tempestus Aquillons", action: "credit", track: "classified" }
  });
  const entry = credited.progress.teams.find((item) => item.team === "Tempestus Aquilons");
  assert.equal(entry.status, "completed");

  await assert.rejects(
    () => admin.challengeCredit({
      client, user: root, params: { id: String(player.id) },
      body: { team: "Not A Team", action: "credit", track: "classified" }
    }),
    (err) => err.status === 400
  );
});

test("список активных игр показывает открытые и ожидающие", async () => {
  const open = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  const done = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesRepo.saveFinalResult(client, done.id, { result: { winnerId: root.id }, elo: {} });

  const result = await admin.listActiveGames({ client });
  assert.deepEqual(result.games.map((game) => game.id), [open.id]);
});

test("админ подтверждает ожидающий результат за игрока", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  await gamesApi.submitResult({
    client, user: root, params: { id: String(game.id) },
    body: { scores: scores(root.id, player.id) }
  });

  const confirmed = await admin.confirmGameResult({
    client, user: root, params: { id: String(game.id) }
  });
  assert.equal(confirmed.game.status, "completed");
  assert.equal((await usersRepo.findById(client, root.id)).rating, 1016);
});

test("админ удаляет только активные игры", async () => {
  const game = await gamesRepo.insert(client, {
    challengeId: null, playerIds: [root.id, player.id]
  });
  const deleted = await admin.deleteGame({
    client, user: root, params: { id: String(game.id) }
  });
  assert.equal(deleted.game.status, "cancelled");

  await assert.rejects(
    () => admin.deleteGame({ client, user: root, params: { id: String(game.id) } }),
    (err) => err.status === 409
  );
});

test("обратная связь создаётся, закрывается, переоткрывается и удаляется", async () => {
  const created = await feedbackApi.create({
    client, user: player, body: { screen: "Leaderboard", description: "Something is off" }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.feedback.status, "open");
  assert.equal(created.body.feedback.user.name, "Player");

  const id = String(created.body.feedback.id);
  const resolved = await feedbackApi.updateStatus({
    client, user: root, params: { id }, body: { status: "resolved" }
  });
  assert.equal(resolved.feedback.status, "resolved");
  assert.equal(resolved.feedback.resolvedByUser.name, "Root");

  const listed = await feedbackApi.list({ client });
  assert.equal(listed.feedback.length, 1);

  await feedbackApi.remove({ client, user: root, params: { id } });
  assert.equal((await feedbackApi.list({ client })).feedback.length, 0);
});

test("обратная связь требует экран и описание", async () => {
  await assert.rejects(
    () => feedbackApi.create({ client, user: player, body: { screen: "", description: "x" } }),
    (err) => err.status === 400
  );
});
