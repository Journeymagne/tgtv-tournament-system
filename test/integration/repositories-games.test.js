const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const users = require("../../src/db/repositories/users");
const challenges = require("../../src/db/repositories/challenges");
const games = require("../../src/db/repositories/games");
const feedback = require("../../src/db/repositories/feedback");

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
  alpha = await users.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "", telegramContact: "@a",
    rating: 1000, isAdmin: true
  });
  bravo = await users.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "", telegramContact: "@b",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

// Helpers for proving that a `FOR UPDATE` lock actually blocks a second
// connection, instead of just asserting that a row came back.
const STILL_BLOCKED = Symbol("still-blocked");

// Resolves to STILL_BLOCKED if `promise` hasn't settled within `ms` — used to
// assert a lock attempt is genuinely stuck, not merely slow.
function assertStillBlocked(promise, ms, message) {
  return Promise.race([
    promise.then(() => "resolved"),
    new Promise((resolve) => setTimeout(() => resolve(STILL_BLOCKED), ms))
  ]).then((outcome) => assert.equal(outcome, STILL_BLOCKED, message));
}

// Bounds a wait so a lock that never releases fails the test instead of
// hanging the suite.
function withDeadline(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

test("челлендж создаётся со статусом pending и share-токеном", async () => {
  const created = await challenges.insert(client, {
    fromUserId: alpha.id, toUserId: bravo.id, shareToken: "a".repeat(36)
  });
  assert.ok(Number.isInteger(created.id));
  assert.equal(created.status, "pending");
  assert.equal(created.shareToken, "a".repeat(36));
  assert.equal(created.gameId, null);
});

test("findByShareToken находит челлендж", async () => {
  const token = "b".repeat(36);
  await challenges.insert(client, { fromUserId: alpha.id, toUserId: bravo.id, shareToken: token });
  assert.ok(await challenges.findByShareToken(client, token));
  assert.equal(await challenges.findByShareToken(client, "c".repeat(36)), null);
});

test("findByShareToken блокирует строку только когда forUpdate: true", async () => {
  const token = "9".repeat(36);
  await challenges.insert(client, { fromUserId: alpha.id, toUserId: bravo.id, shareToken: token });

  const clientA = await pool.connect();
  const clientB = await pool.connect();
  let aDone = false;
  let bDone = false;
  try {
    await clientA.query("BEGIN");
    await clientB.query("BEGIN");

    const lockedByA = await challenges.findByShareToken(clientA, token, { forUpdate: true });
    assert.ok(lockedByA, "A should have locked the challenge row");

    // Default call (no options) must not be a locking read: it should see
    // the committed row immediately, even while A holds FOR UPDATE.
    const plainRead = await challenges.findByShareToken(clientB, token);
    assert.ok(plainRead, "non-locking findByShareToken must not be blocked by another transaction's lock");

    // Requesting a lock from B must now block, since A still holds it.
    const bLockPromise = challenges.findByShareToken(clientB, token, { forUpdate: true });
    await assertStillBlocked(
      bLockPromise, 300,
      "findByShareToken(..., { forUpdate: true }) should block while another transaction holds the lock"
    );

    await clientA.query("COMMIT");
    aDone = true;

    const lockedByB = await withDeadline(
      bLockPromise, 2000,
      "B did not acquire the share-token lock after A committed"
    );
    assert.ok(lockedByB);

    await clientB.query("COMMIT");
    bDone = true;
  } finally {
    if (!aDone) await clientA.query("ROLLBACK").catch(() => {});
    if (!bDone) await clientB.query("ROLLBACK").catch(() => {});
    clientA.release();
    clientB.release();
  }
});

test("share-токен уникален", async () => {
  const token = "d".repeat(36);
  await challenges.insert(client, { fromUserId: alpha.id, toUserId: bravo.id, shareToken: token });
  await assert.rejects(() =>
    challenges.insert(client, { fromUserId: bravo.id, toUserId: alpha.id, shareToken: token })
  );
});

test("findPendingBetween находит челлендж в обе стороны", async () => {
  await challenges.insert(client, {
    fromUserId: alpha.id, toUserId: bravo.id, shareToken: "e".repeat(36)
  });
  assert.ok(await challenges.findPendingBetween(client, alpha.id, bravo.id));
  assert.ok(await challenges.findPendingBetween(client, bravo.id, alpha.id));
});

test("setStatus и attachGame обновляют челлендж", async () => {
  const created = await challenges.insert(client, {
    fromUserId: alpha.id, toUserId: bravo.id, shareToken: "f".repeat(36)
  });
  const game = await games.insert(client, {
    challengeId: created.id, playerIds: [alpha.id, bravo.id]
  });

  const attached = await challenges.attachGame(client, created.id, game.id);
  assert.equal(attached.gameId, game.id);

  const declined = await challenges.setStatus(client, created.id, "declined");
  assert.equal(declined.status, "declined");
  assert.ok(declined.updatedAt);
});

test("игра создаётся открытой и с пустым результатом", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  assert.equal(game.status, "open");
  assert.deepEqual(game.playerIds, [alpha.id, bravo.id]);
  assert.equal(game.result, null);
  assert.equal(game.pendingResult, null);
  assert.equal(game.elo, null);
});

test("savePendingResult переводит игру в ожидание подтверждения", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const result = { winnerId: alpha.id, scores: {}, killzone: null, tiebreakers: null };

  const updated = await games.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: { submittedBy: alpha.id, submittedAt: "2026-01-01T00:00:00.000Z", result }
  });

  assert.equal(updated.status, "pending_confirmation");
  assert.equal(updated.submittedBy, alpha.id);
  assert.ok(updated.submittedAt);
  assert.equal(updated.pendingResult.result.winnerId, alpha.id);
  assert.equal(updated.result, null);
});

test("saveFinalResult завершает игру и сохраняет Elo", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const result = { winnerId: alpha.id, scores: {}, killzone: null, tiebreakers: null };
  const elo = { k: 32, [alpha.id]: { before: 1000, after: 1016, delta: 16 } };

  const finished = await games.saveFinalResult(client, game.id, { result, elo });
  assert.equal(finished.status, "completed");
  assert.equal(finished.pendingResult, null);
  assert.equal(finished.elo[alpha.id].delta, 16);
});

test("clearResult возвращает игру в открытое состояние", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await games.savePendingResult(client, game.id, {
    submittedBy: alpha.id,
    pendingResult: { submittedBy: alpha.id, submittedAt: "2026-01-01T00:00:00.000Z", result: {} }
  });

  const cleared = await games.clearResult(client, game.id);
  assert.equal(cleared.status, "open");
  assert.equal(cleared.submittedBy, null);
  assert.equal(cleared.submittedAt, null);
  assert.equal(cleared.pendingResult, null);
});

test("cancel отменяет игру", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const cancelled = await games.cancel(client, game.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.result, null);
  assert.equal(cancelled.elo, null);
});

test("findActiveBetween видит открытые и ожидающие игры, но не завершённые", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  assert.ok(await games.findActiveBetween(client, alpha.id, bravo.id));

  await games.saveFinalResult(client, game.id, { result: { winnerId: alpha.id }, elo: {} });
  assert.equal(await games.findActiveBetween(client, alpha.id, bravo.id), null);
});

test("listCompleted отдаёт только завершённые, свежие первыми", async () => {
  const first = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  const second = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });
  await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });

  await games.saveFinalResult(client, first.id, { result: { winnerId: alpha.id }, elo: {} });
  await games.saveFinalResult(client, second.id, { result: { winnerId: bravo.id }, elo: {} });

  const list = await games.listCompleted(client);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, second.id);
});

test("lockById блокирует строку игры", async () => {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, bravo.id] });

  // Proves actual row-level locking (needed by Task 17 to serialize two
  // simultaneous match-result confirmations): two independent pool
  // connections, both in transactions, both calling lockById on the same
  // row. B must genuinely block until A commits.
  const clientA = await pool.connect();
  const clientB = await pool.connect();
  let aDone = false;
  let bDone = false;
  try {
    await clientA.query("BEGIN");
    await clientB.query("BEGIN");

    const lockedByA = await games.lockById(clientA, game.id);
    assert.equal(lockedByA.id, game.id);

    const bLockPromise = games.lockById(clientB, game.id);
    await assertStillBlocked(
      bLockPromise, 300,
      "lockById on connection B should still be blocked while A holds the lock"
    );

    await clientA.query("COMMIT");
    aDone = true;

    const lockedByB = await withDeadline(
      bLockPromise, 2000,
      "B did not acquire the lock after A committed"
    );
    assert.equal(lockedByB.id, game.id);

    await clientB.query("COMMIT");
    bDone = true;
  } finally {
    if (!aDone) await clientA.query("ROLLBACK").catch(() => {});
    if (!bDone) await clientB.query("ROLLBACK").catch(() => {});
    clientA.release();
    clientB.release();
  }
});

test("feedback создаётся, меняет статус и удаляется", async () => {
  const created = await feedback.insert(client, {
    userId: alpha.id, screen: "Leaderboard", description: "Broken"
  });
  assert.equal(created.status, "open");

  const resolved = await feedback.setStatus(client, created.id, "resolved", alpha.id);
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolvedBy, alpha.id);
  assert.ok(resolved.resolvedAt);

  const reopened = await feedback.setStatus(client, created.id, "open", alpha.id);
  assert.equal(reopened.resolvedBy, null);
  assert.equal(reopened.resolvedAt, null);

  await feedback.remove(client, created.id);
  assert.equal(await feedback.findById(client, created.id), null);
});
