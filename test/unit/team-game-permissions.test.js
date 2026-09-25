const test = require("node:test");
const assert = require("node:assert/strict");
const { teamGamePermissions } = require("../../src/domain/team-game-permissions");

const a = { id: 10, captainUserId: 1 };
const b = { id: 20, captainUserId: 2 };
const game = { playerIds: [3, 4], status: "open" };
const access = (id, changes = {}) => teamGamePermissions({ ...game, ...changes }, a, b, id ? { id } : null);

test("captains can report teammates' games; other teammates and spectators cannot", () => {
  for (const id of [1, 2, 3, 4]) assert.equal(access(id).canSubmit, true);
  for (const id of [5, null]) {
    assert.equal(access(id).canSubmit, false);
    assert.equal(access(id).canView, false);
  }
  assert.equal(access(5, { status: "completed" }).canView, true);
});

test("captain submissions require the opposing captain, never either ordinary player", () => {
  for (const [submitter, rosterId, confirmer] of [[1, 10, 2], [2, 20, 1]]) {
    const pending = { status: "pending_confirmation", pendingResult: { submittedBy: submitter, submittedAs: "captain", submittedRosterId: rosterId } };
    assert.equal(access(submitter, pending).canSubmit, true);
    assert.equal(access(confirmer, pending).canSubmit, false);
    for (const id of [1, 2, 3, 4, 5, null]) assert.equal(access(id, pending).canReview, id === confirmer);
  }
});

test("player submissions can be reviewed by the opposing player or captain, including legacy results", () => {
  for (const [submitter, rosterId, opponent] of [[3, 10, 4], [4, 20, 3]]) {
    for (const metadata of [{}, { submittedAs: "player", submittedRosterId: rosterId }]) {
      const pending = { status: "pending_confirmation", pendingResult: { submittedBy: submitter, ...metadata } };
      const opposingCaptain = rosterId === a.id ? b.captainUserId : a.captainUserId;
      for (const id of [1, 2, 3, 4, 5, null]) assert.equal(access(id, pending).canReview, [opponent, opposingCaptain].includes(id));
    }
  }
  assert.equal(access(4, { status: "completed" }).canSubmit, false);
});

test("captains report their own games as players, including existing captain-marked results", () => {
  for (const [players, submitter, rosterId, opponent, opposingCaptain] of [
    [[1, 4], 1, 10, 4, 2], [[3, 2], 2, 20, 3, 1]
  ]) {
    assert.equal(access(submitter, { playerIds: players }).submitsAsCaptain, false);
    for (const submittedAs of [undefined, "player", "captain"]) {
      const pending = { playerIds: players, status: "pending_confirmation",
        pendingResult: { submittedBy: submitter, submittedRosterId: rosterId, submittedAs } };
      for (const id of [1, 2, 3, 4, 5, null]) {
        const permissions = access(id, pending);
        assert.equal(permissions.canReview, [opponent, opposingCaptain].includes(id));
        assert.equal(permissions.requiresCaptainReview, false);
      }
    }
  }
  assert.equal(access(1).submitsAsCaptain, true);
  assert.equal(access(3).submitsAsCaptain, false);
});

test("game 344 allows Mortivor or CodyDow to review ImGefest's own game", () => {
  const pending = { playerIds: [94, 100], status: "pending_confirmation",
    pendingResult: { submittedBy: 100, submittedAs: "captain", submittedRosterId: 31 } };
  const rosterA = { id: 14, captainUserId: 117 };
  const rosterB = { id: 31, captainUserId: 100 };
  for (const id of [94, 100, 117, 122, 159]) {
    assert.equal(teamGamePermissions(pending, rosterA, rosterB, { id }).canReview, [94, 117].includes(id));
  }
});

test("administrative review remains available and completed results cannot be reviewed twice", () => {
  const pendingResult = { submittedBy: 1, submittedAs: "captain", submittedRosterId: 10 };
  for (const status of ["open", "pending_confirmation", "completed", "cancelled"]) {
    const permissions = teamGamePermissions({ ...game, status, pendingResult }, a, b, { id: 5, isAdmin: true });
    assert.equal(permissions.canReview, status === "pending_confirmation");
  }
});

test("a captain playing as the opponent can review a player submission", () => {
  assert.equal(access(2, {
    playerIds: [3, 2], status: "pending_confirmation",
    pendingResult: { submittedBy: 3, submittedAs: "player", submittedRosterId: 10 }
  }).canReview, true);
});
