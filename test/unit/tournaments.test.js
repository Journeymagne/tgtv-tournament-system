const test = require("node:test");
const assert = require("node:assert/strict");

const { buildSingleElimination, seedSlotOrder } = require("../../src/domain/tournaments/single-elimination");
const { buildSwissRoundOne, buildSwissNextRound } = require("../../src/domain/tournaments/swiss");
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

function completedSwissMatch(id, participantAId, participantBId, winnerParticipantId) {
  return {
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
  };
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pairingSignature(round) {
  return round.matches
    .filter((match) => !match.isBye)
    .map((match) => [match.participantAId, match.participantBId].sort((a, b) => a - b).join("-"))
    .sort()
    .join("|");
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

test("Swiss next round randomizes within score brackets and floats one player down", () => {
  const participants = Array.from({ length: 6 }, (_, index) =>
    participant(index + 1, index + 1, { status: "active" })
  );
  const previousMatches = [
    completedSwissMatch(1, 1, 4, 1),
    completedSwissMatch(2, 2, 5, 2),
    completedSwissMatch(3, 3, 6, 3)
  ];

  const round = buildSwissNextRound(
    { swissRoundCount: 3, tiebreakerOrder: [] },
    participants,
    previousMatches,
    2,
    seededRandom(7)
  );
  const points = new Map([[1, 3], [2, 3], [3, 3], [4, 0], [5, 0], [6, 0]]);
  const crossBracketMatches = round.matches.filter(
    (match) => !match.isBye && points.get(match.participantAId) !== points.get(match.participantBId)
  );

  assert.equal(crossBracketMatches.length, 1);
  assert.deepEqual(
    round.matches.flatMap((match) => [match.participantAId, match.participantBId].filter(Boolean)).sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6]
  );
});

test("Swiss odd score brackets cascade floaters from the nearest lower bracket", () => {
  const bracketSizes = [3, 4, 3, 4];
  const bracketPoints = [9, 6, 3, 0];
  const participants = [];
  const previousMatches = [];
  const pointsByParticipant = new Map();
  let participantId = 1;
  let matchId = 1;

  bracketSizes.forEach((size, bracketIndex) => {
    for (let index = 0; index < size; index += 1) {
      participants.push(participant(participantId, participantId, { status: "active" }));
      pointsByParticipant.set(participantId, bracketPoints[bracketIndex]);
      for (let win = 0; win < bracketPoints[bracketIndex] / 3; win += 1) {
        previousMatches.push({
          id: matchId,
          status: "completed",
          isBye: true,
          participantAId: participantId,
          participantBId: null,
          winnerParticipantId: participantId,
          result: null
        });
        matchId += 1;
      }
      participantId += 1;
    }
  });

  const round = buildSwissNextRound(
    { swissRoundCount: 4, tiebreakerOrder: [] },
    participants,
    previousMatches,
    4,
    seededRandom(29)
  );
  const crossBracketScores = round.matches
    .filter((match) => pointsByParticipant.get(match.participantAId) !== pointsByParticipant.get(match.participantBId))
    .map((match) => [
      pointsByParticipant.get(match.participantAId),
      pointsByParticipant.get(match.participantBId)
    ].sort((left, right) => right - left))
    .sort((left, right) => right[0] - left[0]);

  assert.deepEqual(crossBracketScores, [[9, 6], [6, 3]]);
});

test("Swiss score brackets produce different valid pairings for different random seeds", () => {
  const participants = Array.from({ length: 8 }, (_, index) =>
    participant(index + 1, index + 1, { status: "active" })
  );
  const previousMatches = [
    completedSwissMatch(1, 1, 5, 1),
    completedSwissMatch(2, 2, 6, 2),
    completedSwissMatch(3, 3, 7, 3),
    completedSwissMatch(4, 4, 8, 4)
  ];
  const signatures = new Set();

  for (let seed = 1; seed <= 12; seed += 1) {
    const round = buildSwissNextRound(
      { swissRoundCount: 3, tiebreakerOrder: [] },
      participants,
      previousMatches,
      2,
      seededRandom(seed)
    );
    signatures.add(pairingSignature(round));
    assert.equal(round.matches.every((match) => {
      const bothWinners = match.participantAId <= 4 && match.participantBId <= 4;
      const bothLosers = match.participantAId > 4 && match.participantBId > 4;
      return bothWinners || bothLosers;
    }), true);
  }

  assert.ok(signatures.size > 1);
});

test("Swiss pairing avoids rematches when a fresh perfect matching exists", () => {
  const participants = Array.from({ length: 4 }, (_, index) =>
    participant(index + 1, index + 1, { status: "active" })
  );
  const previousMatches = [
    completedSwissMatch(1, 1, 2, 1),
    completedSwissMatch(2, 3, 4, 3),
    completedSwissMatch(3, 1, 4, 4),
    completedSwissMatch(4, 2, 3, 2)
  ];

  const round = buildSwissNextRound(
    { swissRoundCount: 3, tiebreakerOrder: [] },
    participants,
    previousMatches,
    3,
    seededRandom(11)
  );

  assert.equal(pairingSignature(round), "1-3|2-4");
});

test("Swiss bye is random in the lowest eligible score bracket and does not repeat while avoidable", () => {
  const participants = Array.from({ length: 5 }, (_, index) =>
    participant(index + 1, index + 1, { status: "active" })
  );
  const previousMatches = [
    completedSwissMatch(1, 1, 3, 1),
    completedSwissMatch(2, 2, 4, 2),
    {
      id: 3,
      status: "completed",
      isBye: true,
      participantAId: 5,
      participantBId: null,
      winnerParticipantId: 5,
      result: null
    }
  ];

  const round = buildSwissNextRound(
    { swissRoundCount: 3, tiebreakerOrder: [] },
    participants,
    previousMatches,
    2,
    seededRandom(17)
  );
  const bye = round.matches.find((match) => match.isBye);

  assert.ok([3, 4].includes(bye.participantAId));
  assert.notEqual(bye.participantAId, 5);
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
