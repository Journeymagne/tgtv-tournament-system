const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateTeamTournament,
  buildFirstTeamRound,
  buildNextTeamRound,
  teamStandings,
  normalizeRoundMissions,
  buildShieldSwordPairings,
  gamePointsForTotals,
  teamTournamentPoints
} = require("../../src/domain/team-tournaments");
const { CRIT_OPS } = require("../../src/domain/kill-teams");
const { ValidationError } = require("../../src/http/io");
const { redactTeamMatch } = require("../../src/api/team-tournaments");

const tournament = { participantMode: "team", format: "swiss", teamSize: 3, swissRoundCount: 3 };
const rosters = [1, 2, 3, 4].map((id) => ({ id, seed: id }));

test("team tournaments require an even number of 4-128 rosters and never create a bye", () => {
  assert.doesNotThrow(() => validateTeamTournament(tournament, rosters));
  assert.throws(() => validateTeamTournament(tournament, rosters.slice(0, 3)), ValidationError);
  assert.throws(() => validateTeamTournament(tournament, [...rosters, { id: 5, seed: 5 }]), /bye is not supported/);
});

test("first team round pairs top seed half against bottom seed half", () => {
  const round = buildFirstTeamRound(tournament, rosters);
  assert.deepEqual(round.pairings, [
    { bracketPosition: 1, rosterAId: 1, rosterBId: 3 },
    { bracketPosition: 2, rosterAId: 2, rosterBId: 4 }
  ]);
  assert.equal(round.pairings.some((pairing) => pairing.isBye), false);
});

test("next team round avoids rematches when another opponent exists", () => {
  const matches = [
    { phase: "completed", rosterAId: 1, rosterBId: 3, teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 40, teamGamePointsB: 20 },
    { phase: "completed", rosterAId: 2, rosterBId: 4, teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 36, teamGamePointsB: 24 }
  ];
  const next = buildNextTeamRound(tournament, rosters, matches, 2);
  assert.equal(next.pairings.some((pairing) => (pairing.rosterAId === 1 && pairing.rosterBId === 3) || (pairing.rosterAId === 2 && pairing.rosterBId === 4)), false);
});

test("next team round avoids a greedy rematch trap when a fresh full matching exists", () => {
  const matches = [
    { phase: "awaiting_roll", rosterAId: 3, rosterBId: 4 }
  ];
  const next = buildNextTeamRound(tournament, rosters, matches, 2);
  assert.equal(next.pairings.some((pairing) => pairKeyForTest(pairing.rosterAId, pairing.rosterBId) === "3:4"), false);
});

function pairKeyForTest(a, b) {
  return [a, b].sort((left, right) => left - right).join(":");
}

test("team rounds require three distinct canonical Crit Ops", () => {
  assert.deepEqual(normalizeRoundMissions(CRIT_OPS.slice(0, 3)), CRIT_OPS.slice(0, 3).map((critOp) => ({ critOp })));
  assert.throws(() => normalizeRoundMissions([CRIT_OPS[0], CRIT_OPS[0], CRIT_OPS[1]]), ValidationError);
});

test("Shield-Sword produces exactly three unique player pairings", () => {
  const membersA = [11, 12, 13].map((id) => ({ id }));
  const membersB = [21, 22, 23].map((id) => ({ id }));
  const pairings = buildShieldSwordPairings(membersA, membersB, { shieldA: 11, shieldB: 21, swordA: 22, swordB: 12 });
  assert.deepEqual(pairings.map((pairing) => [pairing.rosterAMemberId, pairing.rosterBMemberId]), [[11, 22], [12, 21], [13, 23]]);
  assert.equal(new Set(pairings.map((pairing) => pairing.rosterAMemberId)).size, 3);
  assert.equal(new Set(pairings.map((pairing) => pairing.rosterBMemberId)).size, 3);
});

test("captain choices stay hidden from the opponent until both are confirmed", () => {
  const rosterA = { captainUserId: 101 };
  const rosterB = { captainUserId: 202 };
  const match = {
    shieldAMemberId: 11,
    shieldBMemberId: null,
    shieldAConfirmed: true,
    shieldBConfirmed: false,
    swordAMemberId: null,
    swordBMemberId: null,
    swordAConfirmed: false,
    swordBConfirmed: false
  };
  assert.equal(redactTeamMatch(match, rosterA, rosterB, { id: 101 }).shieldAMemberId, 11);
  assert.equal(redactTeamMatch(match, rosterA, rosterB, { id: 202 }).shieldAMemberId, null);
  assert.equal(redactTeamMatch(match, rosterA, rosterB, { id: 303 }).shieldAMemberId, null);
  const revealed = redactTeamMatch({ ...match, shieldBMemberId: 21, shieldBConfirmed: true }, rosterA, rosterB, { id: 303 });
  assert.equal(revealed.shieldAMemberId, 11);
  assert.equal(revealed.shieldBMemberId, 21);
});

test("game points are clamped to 0-20 and always sum to 20", () => {
  assert.deepEqual(gamePointsForTotals(30, 10), { a: 20, b: 0 });
  assert.deepEqual(gamePointsForTotals(10, 30), { a: 0, b: 20 });
  assert.deepEqual(gamePointsForTotals(12, 9), { a: 13, b: 7 });
});

test("team points use the 26-34 draw band", () => {
  assert.deepEqual(teamTournamentPoints(25), { a: 0, b: 2 });
  assert.deepEqual(teamTournamentPoints(26), { a: 1, b: 1 });
  assert.deepEqual(teamTournamentPoints(34), { a: 1, b: 1 });
  assert.deepEqual(teamTournamentPoints(35), { a: 2, b: 0 });
});

test("team standings use points, GP, game wins, Tac Ops, then seed", () => {
  const matches = [{
    phase: "completed", rosterAId: 1, rosterBId: 2,
    teamTournamentPointsA: 1, teamTournamentPointsB: 1,
    teamGamePointsA: 31, teamGamePointsB: 29,
    gamePoints: [
      { winnerSide: "b", tacA: 2, tacB: 1 },
      { winnerSide: "a", tacA: 3, tacB: 2 },
      { winnerSide: null, tacA: 1, tacB: 4 }
    ]
  }];
  const standings = teamStandings(rosters.slice(0, 2), matches);
  assert.equal(standings[0].roster.id, 1);
  assert.equal(standings[0].teamGamePoints, 31);
  assert.equal(standings[0].individualWins, 1);
  assert.equal(standings[0].tacOpPoints, 6);
});
