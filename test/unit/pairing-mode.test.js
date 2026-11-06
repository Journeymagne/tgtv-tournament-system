const test = require("node:test");
const assert = require("node:assert/strict");
const { pairByTP, playedPairKey, buildSwissNextRound } = require("../../src/domain/tournaments/swiss");
const { buildTournamentPreview } = require("../../src/domain/tournaments/preview");
const { normalizeNewTournament, normalizeTournamentPatch } = require("../../src/domain/tournaments/input");
const { tournamentSummaryView } = require("../../src/api/views");

const participants = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1, userId: index + 1, seed: index + 1, status: "active", displayName: `Player ${index + 1}`
}));
const rows = participants.map(participant => ({ participant }));
const ids = pairs => pairs.map(pair => pair.map(row => row.participant.id));

test("By TP pairs from top to bottom and skips past opponents", () => {
  assert.deepEqual(ids(pairByTP(rows, new Set([playedPairKey(1, 2)]))), [[1, 3], [2, 4], [5, 6]]);
});

test("By TP revisits an earlier choice to avoid a rematch at the bottom", () => {
  assert.deepEqual(ids(pairByTP(rows.slice(0, 4), new Set([playedPairKey(3, 4)]))), [[1, 3], [2, 4]]);
});

test("By TP reports when fresh opponents cannot be found", () => {
  const history = new Set([playedPairKey(1, 2), playedPairKey(1, 3), playedPairKey(1, 4)]);
  assert.throws(() => pairByTP(rows.slice(0, 4), history), /without rematches/);
});

test("By TP preview pairs adjacent seeds in round one", () => {
  const preview = buildTournamentPreview({ format: "swiss", swissRoundCount: 3, pairingMode: "by_tp" }, participants);
  assert.deepEqual(preview.rounds[0].matches.map(m => [m.participantAId, m.participantBId]), [[1, 2], [3, 4], [5, 6]]);
});

test("By TP does not use randomness, including when assigning a bye", () => {
  const round = buildSwissNextRound({ swissRoundCount: 3, pairingMode: "by_tp" }, participants.slice(0, 5), [], 2,
    () => { throw new Error("randomness is forbidden"); });
  assert.equal(round.matches.find(m => m.isBye).participantAId, 5);
  assert.deepEqual(round.matches.filter(m => !m.isBye).map(m => [m.participantAId, m.participantBId]), [[1, 2], [3, 4]]);
});

test("pairing mode defaults, validation and API summary preserve the setting", () => {
  assert.equal(normalizeNewTournament({}, 1, "test").pairingMode, "backet_random");
  assert.equal(normalizeNewTournament({ pairingMode: "by_tp" }, 1, "test").pairingMode, "by_tp");
  assert.deepEqual(normalizeTournamentPatch({ pairingMode: "by_tp" }), { pairingMode: "by_tp" });
  assert.throws(() => normalizeTournamentPatch({ pairingMode: "invalid" }), /By TP/);
  assert.equal(tournamentSummaryView({ pairingMode: "by_tp" }).pairingMode, "by_tp");
});

test("By TP applies to team rounds and never calls the random source", () => {
  const { buildFirstTeamRound, buildNextTeamRound } = require("../../src/domain/team-tournaments");
  const tournament = { participantMode: "team", format: "swiss", teamSize: 3, swissRoundCount: 3, pairingMode: "by_tp" };
  const rosters = participants.slice(0, 4).map(({ id, seed }) => ({ id, seed }));
  const first = buildFirstTeamRound(tournament, rosters);
  assert.deepEqual(first.pairings.map(p => [p.rosterAId, p.rosterBId]), [[1, 2], [3, 4]]);
  const next = buildNextTeamRound(tournament, rosters, [{ rosterAId: 1, rosterBId: 2, phase: "awaiting_roll" }], 2,
    () => { throw new Error("randomness is forbidden"); });
  assert.deepEqual(next.pairings.map(p => [p.rosterAId, p.rosterBId]), [[1, 3], [2, 4]]);
});
