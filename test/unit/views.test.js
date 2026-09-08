const test = require("node:test");
const assert = require("node:assert/strict");

const {
  publicUser,
  publicUserSummary,
  leaderboardUser,
  challengeView,
  gameView,
  feedbackView,
  challengeProgressView
} = require("../../src/api/views");

function user(overrides = {}) {
  return {
    id: 1,
    name: "Alpha",
    passwordHash: "salt:hash",
    avatarUrl: "/api/users/1/avatar?v=abc123",
    registerNickname: "Alpha",
    telegramContact: "@alpha",
    challengeCredits: [{ team: "Kasrkin", action: "credit" }],
    rating: 1000,
    isAdmin: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("publicUser никогда не отдаёт хеш пароля", () => {
  assert.equal("passwordHash" in publicUser(user()), false);
});

test("publicUser не отдаёт challengeCredits", () => {
  assert.equal("challengeCredits" in publicUser(user()), false);
});

test("publicUser отдаёт ссылку на аватар и никогда не встраивает картинку", () => {
  assert.equal(publicUser(user()).avatarUrl, "/api/users/1/avatar?v=abc123");
  assert.equal(publicUser(user({ avatarUrl: null })).avatarUrl, null);
  // Ни одно представление больше не должно содержать base64: именно это
  // раздувало каждый ответ, где упоминался игрок.
  assert.doesNotMatch(JSON.stringify(publicUser(user())), /data:image/);
});

test("leaderboardUser не содержит контактов", () => {
  const row = leaderboardUser(user());
  assert.deepEqual(Object.keys(row).sort(), ["avatarUrl", "id", "isAdmin", "name", "rating", "ratings"]);
});

test("publicUserSummary сохраняет контакты для авторизованных представлений", () => {
  const summary = publicUserSummary(user());
  assert.equal(summary.telegramContact, "@alpha");
  assert.equal(summary.registerNickname, "Alpha");
  assert.equal("passwordHash" in summary, false);
  assert.equal("challengeCredits" in summary, false);
});

test("challengeView подставляет участников", () => {
  const challenge = {
    id: 5, fromUserId: 1, toUserId: 2, status: "pending", gameId: null,
    shareToken: "x".repeat(36), createdAt: "2026-01-01T00:00:00.000Z", updatedAt: null
  };
  const view = challengeView(challenge, [user(), user({ id: 2, name: "Bravo" })]);

  assert.equal(view.id, 5);
  assert.equal(view.from.name, "Alpha");
  assert.equal(view.to.name, "Bravo");
  assert.equal(view.gameId, null);
  assert.equal(view.shareToken, "x".repeat(36));
});

test("challengeView не падает на удалённых участниках", () => {
  const challenge = { id: 5, fromUserId: 1, toUserId: 99, status: "pending", gameId: null };
  const view = challengeView(challenge, [user()]);
  assert.equal(view.to, null);
});

test("gameView подставляет игроков и не тащит их кредиты", () => {
  const game = { id: 7, playerIds: [1, 2], status: "open", result: null };
  const view = gameView(game, [user(), user({ id: 2, name: "Bravo" })]);

  assert.equal(view.players.length, 2);
  assert.equal("challengeCredits" in view.players[0], false);
  assert.equal("passwordHash" in view.players[0], false);
});

test("feedbackView подставляет автора и закрывшего", () => {
  const item = { id: 3, userId: 1, screen: "Top", description: "x", status: "resolved", resolvedBy: 2 };
  const view = feedbackView(item, [user(), user({ id: 2, name: "Bravo" })]);

  assert.equal(view.user.name, "Alpha");
  assert.equal(view.resolvedByUser.name, "Bravo");
});

test("challengeProgressView сохраняет прежнюю форму ответа", () => {
  const view = challengeProgressView([], user({ challengeCredits: [] }));

  assert.ok(Array.isArray(view.teams));
  assert.equal(typeof view.total, "number");
  assert.equal(typeof view.completedCount, "number");
  assert.ok(view.tracks.classified);
  assert.ok(view.tracks.allKillTeam);
  assert.equal(view.user.id, 1);
  assert.equal(view.tracks.classified.user.id, 1);
  assert.equal(view.tracks.allKillTeam.user.id, 1);
});
