const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSingleElimination, seedSlotOrder } = require("../../src/domain/tournaments/single-elimination");
const { buildSwissRoundOne } = require("../../src/domain/tournaments/swiss");
const { buildTournamentPreview } = require("../../src/domain/tournaments/preview");
const { buildStandings } = require("../../src/domain/tournaments/standings");

function participant(id, seed, overrides = {}) {
  return {
    id,
    userId: id,
    displayName: `Player ${id}`,
    seed,
    status: "joined",
    ...overrides
  };
}

test("single elimination lays out seeds 1-8 into standard slots", () => {
  assert.deepEqual(seedSlotOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);

  const preview = buildSingleElimination([
    participant(1, 1),
    participant(2, 2),
    participant(3, 3),
    participant(4, 4),
    participant(5, 5),
    participant(6, 6),
    participant(7, 7),
    participant(8, 8)
  ], 8);

  assert.equal(preview.bracketSize, 8);
  assert.equal(preview.rounds.length, 3);
  assert.deepEqual(
    preview.rounds[0].matches.map((match) => [match.participantAId, match.participantBId]),
    [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6]
    ]
  );
});

test("single elimination rejects incomplete fixed brackets", () => {
  assert.throws(
    () => buildSingleElimination([
      participant(1, 1),
      participant(2, 2),
      participant(3, 3),
      participant(4, 4),
      participant(5, 5),
      participant(6, 6),
      participant(7, 7)
    ], 8),
    /exactly 8 active participants/
  );
});

test("Swiss round 1 pairs top seed half with bottom seed half and gives the last seed a bye", () => {
  const preview = buildSwissRoundOne([
    participant(1, 1),
    participant(2, 2),
    participant(3, 3),
    participant(4, 4),
    participant(5, 5)
  ], 3);

  assert.equal(preview.rounds.length, 1);
  assert.deepEqual(
    preview.rounds[0].matches.map((match) => [match.participantAId, match.participantBId, match.isBye]),
    [
      [5, null, true],
      [1, 3, false],
      [2, 4, false]
    ]
  );
});

test("Swiss round count has no product upper limit", () => {
  const preview = buildSwissRoundOne([
    participant(1, 1),
    participant(2, 2),
    participant(3, 3),
    participant(4, 4)
  ], 100);

  assert.equal(preview.swissRoundCount, 100);
  assert.equal(preview.rounds.length, 1);
});

test("pending placement is excluded from the current Swiss round preview", () => {
  const preview = buildTournamentPreview(
    { format: "swiss", swissRoundCount: 2 },
    [
      participant(1, 1),
      participant(2, 2),
      participant(3, 3),
      participant(4, 4),
      participant(5, 5, { status: "pending_placement" })
    ]
  );

  const participantIds = preview.rounds[0].matches.flatMap((match) =>
    [match.participantAId, match.participantBId].filter(Boolean)
  );
  assert.deepEqual(participantIds.sort((a, b) => a - b), [1, 2, 3, 4]);
});

test("standings use Total VP and VP Diff only when they are enabled in tiebreakerOrder", () => {
  const participants = [participant(1, 1), participant(2, 2), participant(3, 3), participant(4, 4)];
  const matches = [
    {
      id: 1,
      status: "completed",
      isBye: false,
      participantAId: 1,
      participantBId: 2,
      winnerParticipantId: 1,
      result: { winnerId: 1, scores: { 1: { total: 12 }, 2: { total: 10 } } }
    },
    {
      id: 2,
      status: "completed",
      isBye: false,
      participantAId: 3,
      participantBId: 4,
      winnerParticipantId: 3,
      result: { winnerId: 3, scores: { 3: { total: 9 }, 4: { total: 8 } } }
    }
  ];

  const withoutTiebreakers = buildStandings(participants, matches, []);
  assert.deepEqual(withoutTiebreakers.slice(0, 2).map((row) => row.participant.id), [1, 3]);
  assert.deepEqual(withoutTiebreakers.slice(0, 2).map((row) => row.rank), [1, 1]);

  const withTiebreakers = buildStandings(participants, matches, ["total_vp", "vp_diff"]);
  assert.deepEqual(withTiebreakers.slice(0, 2).map((row) => row.participant.id), [1, 3]);
  assert.deepEqual(withTiebreakers.slice(0, 2).map((row) => row.rank), [1, 2]);
  assert.equal(withTiebreakers[0].totalVp, 12);
  assert.equal(withTiebreakers[0].vpDiff, 2);
});

test("standings calculate Strength of Schedule and trimmed Buchholz separately", () => {
  const participants = [1, 2, 3, 4, 5].map((id) => participant(id, id));
  const match = (id, participantAId, participantBId, winnerParticipantId) => ({
    id,
    status: "completed",
    isBye: false,
    participantAId,
    participantBId,
    winnerParticipantId,
    result: {
      winnerId: winnerParticipantId,
      scores: {
        [participantAId]: { total: winnerParticipantId === participantAId ? 12 : 8 },
        [participantBId]: { total: winnerParticipantId === participantBId ? 12 : 8 }
      }
    }
  });
  const standings = buildStandings(participants, [
    match(1, 1, 2, 1),
    match(2, 1, 3, 1),
    match(3, 1, 4, 1),
    match(4, 2, 3, 2),
    match(5, 2, 4, 2),
    match(6, 3, 5, 3)
  ], []);

  const row = standings.find((item) => item.participant.id === 1);
  assert.equal(row.strengthOfSchedule, 9);
  assert.equal(row.buchholz, 3);
});
