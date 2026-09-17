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

test("player submissions can be reviewed by the opposing player or opposing captain", () => {
  const pending = { status: "pending_confirmation", pendingResult: { submittedBy: 3 } };
  assert.equal(access(1, pending).canReview, false);
  assert.equal(access(2, pending).canReview, true);
  assert.equal(access(4, pending).canReview, true);
  assert.equal(access(3, pending).canReview, false);
  assert.equal(access(4, { status: "completed" }).canSubmit, false);
});
