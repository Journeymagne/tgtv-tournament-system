const test = require("node:test");
const assert = require("node:assert/strict");
const { teamEnvironmentPlan, teamNextAction, teamMatchProgress, teamPointsForMatch, teamStandings, validateTeamLines, normalizeRoundMissions } = require("../../src/domain/team-tournaments");
const { normalizeNewTournament, normalizeTournamentPatch } = require("../../src/domain/tournaments/input");

const classic = { pairingType: "sword_shield_classic", pairingVersion: 2, rosterAId: 1, rosterBId: 2,
  attackerRosterId: 1, phase: "environment_selection", pairings: [{ slot: 1, shieldOwner: "a" }, { slot: 2, shieldOwner: "b" }, { slot: 3, shieldOwner: null }] };
const game = (slot, vpA, vpB, status = "completed") => ({ slot, game: { status, playerIds: [10, 20], result: { scores: { 10: { total: vpA, tac: 0 }, 20: { total: vpB, tac: 0 } } } } });

test("Classic sums individual 3/1/0 points despite a negative total VP difference", () => {
  const match = { ...classic, games: [game(1,21,18), game(2,21,18), game(3,0,21)] };
  const progress = teamMatchProgress(match);
  assert.deepEqual(teamPointsForMatch(match), { a: 6, b: 3 });
  assert.deepEqual(teamPointsForMatch(match, { completed: 3, winsA: 0, winsB: 2 }), { a: 1, b: 7 });
  assert.equal(progress.gpA, null);
  assert.equal(progress.gpB, null);
  assert.equal(progress.winsA, 2);
  assert.equal(Object.hasOwn(progress.details[0], "a"), false);
});

test("equal player wins draw the Classic team match; pending games do not count", () => {
  const match = { ...classic, games: [game(1,10,5), game(2,5,10), game(3,8,8), game(4,21,0,"pending_confirmation")] };
  assert.deepEqual(teamPointsForMatch(match), { a: 4, b: 4 });
  assert.equal(teamMatchProgress(match).completed, 3);
});

test("Classic captains choose either parameter for their own shield, then the opponent completes it", () => {
  assert.deepEqual(teamNextAction(classic), { side: "a", slot: 1, kind: "either" });
  assert.deepEqual(teamNextAction({ ...classic, environment: { step: 1, choices: ["mission"] } }), { side: "b", slot: 1, kind: "table" });
  assert.deepEqual(teamNextAction({ ...classic, attackerRosterId: 2 }), { side: "b", slot: 2, kind: "either" });
  assert.deepEqual(teamNextAction({ ...classic, environment: { step: 3, choices: ["table", "mission", "table"] } }), { side: "a", slot: 2, kind: "mission" });
  assert.equal(teamEnvironmentPlan(classic).length, 4);
  assert.deepEqual(teamEnvironmentPlan({ ...classic, captainPairingEnabled: false }), []);
});

test("WTC keeps its GP thresholds and five environment steps", () => {
  const match = { ...classic, pairingType: "shield_sword", games: [game(1,21,18), game(2,21,18), game(3,0,21)] };
  assert.equal(teamMatchProgress(match).gpA, 26);
  assert.deepEqual(teamPointsForMatch(match), { a: 0, b: 2 });
  assert.equal(teamEnvironmentPlan(match).length, 5);
  assert.deepEqual(teamEnvironmentPlan(match)[0], { side: "a", kind: "table", slot: 2 });
});

test("complete lines use distinct physical numbers but can repeat terrain", () => {
  const tables = Array.from({ length: 6 }, (_, i) => ({ tableNumber: i + 1, killzone: "Volkus", deployment: 1 }));
  assert.equal(validateTeamLines(tables).length, 6);
  assert.throws(() => validateTeamLines(tables.slice(0,5)));
  assert.throws(() => validateTeamLines(tables.map((table,i) => ({ ...table, tableNumber: i === 5 ? 1 : table.tableNumber }))));
  assert.throws(() => normalizeRoundMissions(["Secure", "Secure", "Data"]));
});

test("ordered team tiebreakers and an empty order keep primary team points first", () => {
  const rosters = [{ id: 1, seed: 1 }, { id: 2, seed: 2 }];
  const matches = [{ ...classic, phase: "completed", teamTournamentPointsA: 1, teamTournamentPointsB: 1,
    games: [game(1,21,20), game(2,1,2), game(3,0,0)] }];
  assert.equal(teamStandings(rosters, matches, ["vp_diff"])[0].roster.id, 1);
  const asymmetric = [{ ...matches[0], games: [game(1,10,5),game(2,0,10),game(3,0,0)] }];
  assert.equal(teamStandings(rosters, asymmetric, ["vp_diff"])[0].roster.id, 2);
  assert.equal(teamStandings(rosters, asymmetric, [])[0].roster.id, 1);
  assert.equal(teamStandings(rosters, [{ ...asymmetric[0], games: [game(1,10,5),game(2,10,0),game(3,0,0)] }], ["vp_diff"])[0].roster.id, 1);
  assert.equal(teamStandings(rosters, asymmetric, ["vp_diff"])[0].vpDiff, 5);
});

test("creation preserves Classic and disabled captain pairing; legacy ordering is opt-in", () => {
  const input = { participantMode: "team", format: "swiss", swissRoundCount: 3, pairingType: "sword_shield_classic", captainPairingEnabled: false };
  const tournament = normalizeNewTournament(input, 1, "classic");
  assert.equal(tournament.pairingType, "sword_shield_classic");
  assert.equal(tournament.captainPairingEnabled, false);
  assert.equal(tournament.teamTiebreakerOrder, null);
  assert.throws(() => normalizeTournamentPatch({ teamTiebreakerOrder: ["vp_diff", "vp_diff"] }, tournament));
  assert.throws(() => normalizeTournamentPatch({ captainPairingEnabled: "false" }, tournament));
});

test("Classic standings derive player points from games instead of old match points", () => {
  const rosters = [{ id: 1 }, { id: 2 }];
  for (const points of [2, 3]) {
    const rows = teamStandings(rosters, [{ ...classic, phase: "completed", teamTournamentPointsA: points, teamTournamentPointsB: 0,
      games: [game(1,21,18), game(2,21,18), game(3,0,21)] }]);
    assert.equal(rows[0].teamTournamentPoints, 6);
    assert.equal(rows[1].teamTournamentPoints, 3);
    assert.equal(rows[0].wins, 1);
    assert.equal(rows[1].losses, 1);
  }
});

test("Classic ranks five wins and a loss (15 TP) above four wins, a draw and a loss (13 TP)", () => {
  const rosters = [{ id: 1, seed: 2 }, { id: 2, seed: 1 }, { id: 3 }, { id: 4 }];
  const match = (a, b, totals) => ({ ...classic, rosterAId: a, rosterBId: b, phase: "completed",
    games: totals.map(([vpA, vpB], index) => game(index + 1, vpA, vpB)) });
  const matches = [match(1, 3, [[21,0], [21,0], [21,0]]), match(1, 4, [[21,0], [21,0], [0,21]]),
    match(2, 4, [[21,0], [21,0], [0,21]]), match(2, 3, [[21,0], [21,0], [8,8]])];
  const rows = teamStandings(rosters, matches, []);
  assert.equal(rows[0].roster.id, 1);
  assert.equal(rows[0].teamTournamentPoints, 15);
  assert.equal(rows[1].roster.id, 2);
  assert.equal(rows[1].teamTournamentPoints, 13);
});

test("Classic counts confirmed personal points during a round without counting a match win yet", () => {
  const rows = teamStandings([{ id: 1 }, { id: 2 }], [{ ...classic, phase: "in_progress",
    games: [game(1,21,0), game(2,8,8), game(3,21,0,"pending_confirmation")] }]);
  assert.equal(rows[0].teamTournamentPoints, 4);
  assert.equal(rows[1].teamTournamentPoints, 1);
  assert.equal(rows[0].played, 0);
  assert.equal(rows[0].wins, 0);
});

test("Classic equal personal totals count as a team draw, and technical results award a full round", () => {
  const rows = teamStandings([{ id: 1 }, { id: 2 }], [{ ...classic, phase: "completed",
    games: [game(1,21,0), game(2,0,21), game(3,8,8)] }]);
  assert.equal(rows[0].teamTournamentPoints, 4);
  assert.equal(rows[0].draws, 1);
  assert.equal(rows[1].draws, 1);
  assert.deepEqual(teamPointsForMatch({ ...classic, resolution: "bye" }), { a: 9, b: 0 });
  assert.deepEqual(teamPointsForMatch({ ...classic, resolution: "forfeit", teamTournamentPointsA: 0, teamTournamentPointsB: 3 }), { a: 0, b: 9 });
});

test("IRL lines allow omitted Killzones while requiring valid deployment and table numbers", () => {
  const tables = [1, 2, 3].map(tableNumber => ({ tableNumber, deployment: 1 }));
  assert.deepEqual(validateTeamLines(tables, "irl").map(table => table.killzone), ["", "", ""]);
  assert.throws(() => validateTeamLines(tables, "tts"));
  assert.throws(() => validateTeamLines(tables.map(table => ({ ...table, killzone: "invalid" })), "irl"));
  assert.throws(() => validateTeamLines(tables.map(table => ({ ...table, deployment: null })), "irl"));
  assert.throws(() => validateTeamLines(tables.map(table => ({ ...table, tableNumber: 1 })), "irl"));
});

test("Classic defaults to all nine missions and keeps valid legacy round pools", () => {
  const { CRIT_OPS } = require("../../src/domain/kill-teams");
  assert.deepEqual(normalizeRoundMissions(), CRIT_OPS.map(critOp => ({ critOp })));
  assert.equal(normalizeRoundMissions().length, 9);
  assert.deepEqual(normalizeRoundMissions(["Secure", "Loot", "Data"]), ["Secure", "Loot", "Data"].map(critOp => ({ critOp })));
  assert.throws(() => normalizeRoundMissions([]));
  assert.throws(() => normalizeRoundMissions(["Secure", "Loot", "invalid"]));
});

test("the captain without initial initiative chooses the third Classic mission from the expanded pool", () => {
  for (const attackerRosterId of [1, 2]) {
    const match = { ...classic, attackerRosterId, missions: normalizeRoundMissions(),
      environment: { step: 4, choices: ["table", "mission", "mission", "table"] } };
    assert.equal(teamEnvironmentPlan(match).length, 5);
    assert.deepEqual(teamNextAction(match), { side: attackerRosterId === 1 ? "b" : "a", slot: 3, kind: "mission" });
    assert.equal(teamNextAction({ ...match, environment: { ...match.environment, step: 5 } }), null);
    assert.equal(teamEnvironmentPlan({ ...match, missions: normalizeRoundMissions(["Secure", "Loot", "Data"]) }).length, 4);
  }
});
