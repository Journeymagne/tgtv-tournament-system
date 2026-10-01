const test = require("node:test");
const assert = require("node:assert/strict");
const { matchParticipant, participantIdentity, participantResultKey } = require("../../src/domain/tournaments/results");
const { buildStandings } = require("../../src/domain/tournaments/standings");
const { calculateParticipantElo } = require("../../src/domain/elo");

test("a replacement retains seat points while the recorded player remains historical", () => {
  const former = { id: 1, userId: 10, displayName: "Former", status: "active" };
  const current = { ...former, userId: 20, displayName: "Current", user: { id: 20 } };
  const opponent = { id: 2, userId: 30, status: "active" };
  const match = { participantAId: 1, participantBId: 2, winnerParticipantId: 1, status: "completed",
    participantSnapshots: { 1: participantIdentity(former) },
    result: { winnerId: 10, scoresByParticipantId: { 1: { total: 21 }, 2: { total: 10 } } } };
  assert.equal(buildStandings([current, opponent], [match])[0].matchPoints, 3);
  const historical = matchParticipant(match, current);
  assert.equal(historical.userId, 10);
  assert.equal(historical.displayName, "Former");
  assert.equal(historical.user, null);
  assert.equal(participantResultKey(historical), 10);
});

test("proxy results never change either rating; real unregistered players retain existing rating rules", () => {
  const registered = { userId: 8, resultKey: 8 };
  const guest = { userId: null, resultKey: -2 };
  const result = { winnerId: 8 };
  const ratings = new Map([[8, 1000]]);
  assert.equal(calculateParticipantElo([registered, { ...guest, isProxy: true }], ratings, result), null);
  assert.ok(calculateParticipantElo([registered, guest], ratings, result)[8].delta > 0);
});
