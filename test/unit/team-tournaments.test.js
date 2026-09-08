const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateTeamTournament,
  buildFirstTeamRound,
  buildNextTeamRound,
  teamStandings,
  teamMatchProgress,
  normalizeRoundMissions,
  validateTeamTables,
  teamEnvironmentPlan,
  teamNextAction,
  teamRollRound,
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

test("started tournaments keep pairing after withdrawals, including odd fields and a single roster", () => {
  const started = { ...tournament, status: "in_progress" };
  for (const count of [1, 2, 3]) {
    const active = rosters.slice(0, count);
    for (const round of [buildFirstTeamRound(started, active), buildNextTeamRound(started, active, [], 2)]) {
      assert.deepEqual(round.pairings.flatMap((m) => [m.rosterAId, m.rosterBId]).filter(Boolean).sort(), active.map((r) => r.id));
      assert.equal(round.pairings.filter((m) => m.rosterBId === null).length, count % 2);
    }
  }
  assert.throws(() => buildFirstTeamRound(started, []), /No active rosters/);
});

test("bye allocation avoids a second free win while another roster has received none", () => {
  const active = rosters.slice(0, 3);
  const matches = [{ rosterAId: 3, rosterBId: null, resolution: "bye", phase: "completed", teamTournamentPointsA: 2, teamGamePointsA: 60 }];
  const next = buildNextTeamRound({ ...tournament, status: "in_progress" }, active, matches, 2);
  assert.notEqual(next.pairings.find((m) => m.rosterBId === null).rosterAId, 3);
});

test("opponents retain points against a removed roster and byes do not invent personal results", () => {
  const matches = [
    { rosterAId: 1, rosterBId: 2, phase: "completed", teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 40, teamGamePointsB: 20 },
    { rosterAId: 1, rosterBId: null, phase: "completed", resolution: "bye", teamTournamentPointsA: 2, teamGamePointsA: 60 }
  ];
  const winner = teamStandings([rosters[0]], matches)[0];
  assert.equal(winner.teamTournamentPoints, 4);
  assert.equal(winner.teamGamePoints, 100);
  assert.equal(winner.played, 2);
  assert.equal(winner.wins, 2);
  assert.equal(winner.individualWins, 0);
  assert.equal(winner.totalVp, 0);
  assert.equal(teamStandings([rosters[1]], matches)[0].losses, 1);
});

test("legacy team rounds require three distinct canonical Crit Ops", () => {
  assert.deepEqual(normalizeRoundMissions(CRIT_OPS.slice(0, 3)), CRIT_OPS.slice(0, 3).map((critOp) => ({ critOp })));
  assert.throws(() => normalizeRoundMissions([CRIT_OPS[0], CRIT_OPS[0], CRIT_OPS[1]]), ValidationError);
});

test("shared team tables require three different Killzones and layouts 1-6", () => {
  const tables = ["Volkus", "Gallowdark", "Tomb World"].map((killzone, index) => ({ killzone, deployment: index + 1 }));
  assert.doesNotThrow(() => validateTeamTables(tables));
  for (const invalid of [null, tables.slice(0, 2), [...tables, tables[0]], [null, ...tables.slice(1)],
    [tables[0], tables[0], tables[2]], ...[0, 7, 1.5, true, null, ""].map((deployment) => [{ ...tables[0], deployment }, ...tables.slice(1)])]) {
    assert.throws(() => validateTeamTables(invalid), ValidationError);
  }
});

test("Defender and Attacker each ban once; table chooser attacks each Shield", () => {
  for (const attacker of ["a", "b"]) {
    const defender = attacker === "a" ? "b" : "a";
    const match = { pairingVersion: 2, phase: "mission_ban", rosterAId: 1, rosterBId: 2,
      attackerRosterId: attacker === "a" ? 1 : 2, missionBans: [],
      pairings: [{ slot: 1, shieldOwner: "a" }, { slot: 2, shieldOwner: "b" }, { slot: 3, shieldOwner: null }] };
    assert.deepEqual(teamNextAction(match), { kind: "ban", side: defender });
    assert.deepEqual(teamNextAction({ ...match, missionBans: [{ side: defender, mission: CRIT_OPS[0] }] }), { kind: "ban", side: attacker });
    const defenderSlot = defender === "a" ? 1 : 2;
    const attackerSlot = attacker === "a" ? 1 : 2;
    const plan = [
      { side: attacker, kind: "table", slot: defenderSlot },
      { side: defender, kind: "mission", slot: defenderSlot },
      { side: defender, kind: "table", slot: attackerSlot },
      { side: attacker, kind: "mission", slot: attackerSlot },
      { side: defender, kind: "mission", slot: 3 }
    ];
    assert.deepEqual(teamEnvironmentPlan(match), plan);
    for (let step = 0; step < plan.length; step += 1) {
      assert.deepEqual(teamNextAction({ ...match, phase: "environment_selection", environment: { step } }), plan[step]);
    }
    assert.equal(teamNextAction({ ...match, phase: "in_progress" }), null);
    assert.equal(teamNextAction({ ...match, pairingVersion: 1 }), null);
  }
});

test("roll rounds advance only after both dice are recorded", () => {
  assert.equal(teamRollRound({}), 1);
  assert.equal(teamRollRound({ rollHistory: [{ a: 3, b: null }] }), 1);
  assert.equal(teamRollRound({ rollHistory: [{ a: null, b: 3 }] }), 1);
  assert.equal(teamRollRound({ rollHistory: [{ a: 3, b: 3 }] }), 2);
  assert.equal(teamRollRound({ rollHistory: [{ a: 3, b: 3 }, { a: 6, b: null }] }), 2);
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

test("team points use the 28-32 draw band symmetrically", () => {
  assert.deepEqual(teamTournamentPoints(27), { a: 0, b: 2 });
  assert.deepEqual(teamTournamentPoints(28), { a: 1, b: 1 });
  assert.deepEqual(teamTournamentPoints(32), { a: 1, b: 1 });
  assert.deepEqual(teamTournamentPoints(33), { a: 2, b: 0 });
  for (let gp = 0; gp <= 60; gp += 1) {
    const points = teamTournamentPoints(gp);
    const opposite = teamTournamentPoints(60 - gp);
    assert.equal(points.a, opposite.b);
    assert.equal(points.a + points.b, 2);
  }
});

test("team standings use team points, individual wins, VP, Tac Op VP, then seed; never GP", () => {
  const match = { phase: "completed", rosterAId: 1, rosterBId: 2,
    teamTournamentPointsA: 1, teamTournamentPointsB: 1, teamGamePointsA: 34, teamGamePointsB: 26 };
  const rank = (details, overrides = {}) => teamStandings(rosters.slice(0, 2), [{ ...match, ...overrides, gamePoints: details }]);
  assert.equal(rank([{ winnerSide: "b", vpA: 50, vpB: 1, tacA: 6, tacB: 0 }])[0].roster.id, 2);
  assert.equal(rank([{ winnerSide: null, vpA: 30, vpB: 31, tacA: 6, tacB: 0 }])[0].roster.id, 2);
  assert.equal(rank([{ winnerSide: null, vpA: 30, vpB: 30, tacA: 5, tacB: 6 }])[0].roster.id, 2);
  assert.equal(rank([{ winnerSide: "a", vpA: 50, vpB: 1, tacA: 6, tacB: 0 }], { teamTournamentPointsA: 0, teamTournamentPointsB: 2 })[0].roster.id, 2);
  assert.equal(rank([{ winnerSide: null, vpA: 30, vpB: 30, tacA: 6, tacB: 6 }])[0].roster.id, 1);
});

test("live GP, wins, VP and raw Tac Op VP include only finished games, even before the team match finishes", () => {
  const scores = { 11: { total: 18, tac: 6, primaryBonus: 3 }, 21: { total: 14, tac: 4, primaryBonus: 2 } };
  const finished = { slot: 1, game: { status: "completed", playerIds: [11, 21], result: { scores, winnerId: 11 } } };
  const pending = { slot: 2, game: { status: "pending_confirmation", playerIds: [12, 22], pendingResult: { result: { scores } } } };
  const open = { slot: 3, game: { status: "open", playerIds: [13, 23] } };
  const match = { phase: "in_progress", rosterAId: 1, rosterBId: 2, games: [finished, pending, open] };
  const progress = teamMatchProgress(match);
  assert.equal(progress.completed, 1);
  assert.equal(progress.gpA, 14);
  assert.equal(progress.gpB, 6);
  const [a, b] = teamStandings(rosters.slice(0, 2), [match]);
  assert.equal(a.teamTournamentPoints, 0);
  assert.equal(a.played, 0);
  assert.equal(a.individualWins, 1);
  assert.equal(a.totalVp, 18);
  assert.equal(a.tacOpPoints, 6);
  assert.equal(b.tacOpPoints, 4);
  const secondPlayer = { slot: 2, game: { status: "completed", playerIds: [12, 22], result: {
    scores: { 12: { total: 16, tac: 5, primaryBonus: 3 }, 22: { total: 14, tac: 4 } }
  } } };
  const next = { ...match, games: [finished, secondPlayer, open] };
  const cumulative = teamStandings(rosters.slice(0, 2), [match, next]);
  assert.equal(cumulative[0].tacOpPoints, 17, "sum raw Tac Op VP across players and rounds, excluding Primary bonus");
  assert.equal(cumulative[0].totalVp, 52);
  assert.equal(cumulative[0].individualWins, 3);
  const tied = structuredClone(match);
  tied.games[0].game.result.scores[21].total = 18;
  assert.equal(teamMatchProgress(tied).details[0].winnerSide, null, "equal VP cannot count a historical personal tiebreaker win");
});
