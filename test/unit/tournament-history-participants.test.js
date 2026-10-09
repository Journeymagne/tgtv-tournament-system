const test = require("node:test");
const assert = require("node:assert/strict");
const { tournamentDetailView } = require("../../src/api/views");

test("removed opponents remain named in match history without returning to the current roster", () => {
  const active = { id: 1, userId: 10, displayName: "MaxFactor", status: "active", faction: "Kommandos" };
  const removed = { id: 2, userId: null, displayName: "Proxybot 1", status: "removed", isProxy: true, faction: "Hierotek Circle" };
  const round = { id: 3, roundNumber: 1, status: "completed" };
  const match = { id: 4, roundId: 3, status: "completed", participantAId: 2, participantBId: 1,
    winnerParticipantId: 1, result: { winnerId: 10, scoresByParticipantId: { 1: { total: 12 }, 2: { total: 0 } } } };
  const shown = tournamentDetailView({ tournament: { id: 5 }, participants: [active], matchParticipants: [active, removed], rounds: [round], matches: [match] });
  assert.deepEqual(shown.participants.map(p => p.id), [1]);
  const historical = shown.rounds[0].matches[0];
  assert.equal(historical.participantA.displayName, "Proxybot 1");
  assert.equal(historical.participantA.status, "removed");
  assert.equal(historical.result.scoresByParticipantId[2].total, 0);
  assert.equal(historical.participantB.displayName, "MaxFactor");
});

test("historical participant mapping preserves frozen identities and faction privacy", () => {
  const participant = { id: 1, userId: 10, displayName: "Replacement", status: "removed", faction: "Kommandos" };
  const saved = { id: 1, userId: 20, displayName: "Original", faction: "Hierotek Circle" };
  const data = { tournament: { id: 5 }, participants: [], matchParticipants: [participant],
    rounds: [{ id: 3, roundNumber: 1, status: "not_ready" }],
    matches: [{ id: 4, roundId: 3, participantAId: 1, participantSnapshots: { 1: saved } }] };
  const shown = tournamentDetailView(data).rounds[0].matches[0].participantA;
  assert.equal(shown.displayName, "Original");
  assert.equal(shown.userId, 20);
  assert.equal(shown.faction, "");
  assert.equal(shown.factionHidden, true);
  assert.equal(tournamentDetailView({ ...data, viewer: { canAdmin: true } }).rounds[0].matches[0].participantA.faction, "Hierotek Circle");
});
