const test = require("node:test");
const assert = require("node:assert/strict");
const { teamMatchProgress, teamPointsForMatch, doublesScoring, teamStandings, validateTeamTournament, validateTeamLines, normalizeRoundMissions } = require("../../src/domain/team-tournaments");
const { normalizeNewTournament, normalizeTournamentPatch } = require("../../src/domain/tournaments/input");
const { CRIT_OPS } = require("../../src/domain/kill-teams");
const tournament = { participantMode: "team", format: "swiss", pairingType: "doubles", teamSize: 2, venueMode: "irl", swissRoundCount: 4 };
const game = (slot, a, b, status = "completed") => ({ slot, game: { status, playerIds: [10,20], result: { scores: { 10: { total: a }, 20: { total: b } } } } });
const match = (a, b, games, phase = "completed") => ({ pairingType: "doubles", rosterAId: a, rosterBId: b, games, phase });

test("Doubles source example, equal VP, draws and sweeps use 2/1/0 plus one team bonus", () => {
  for (const [scores, expected] of [
    [[20,4,1,18], { a:2,b:3 }], [[18,10,12,9], { a:5,b:0 }],
    [[10,8,7,7], { a:4,b:1 }], [[20,4,1,10], { a:3,b:2 }],
    [[10,8,6,8], { a:2,b:2 }], [[10,10,7,7], { a:2,b:2 }],
    [[8,10,7,7], { a:1,b:4 }], [[4,20,1,18], { a:0,b:5 }]
  ]) {
    const value = match(1,2,[game(1,scores[0],scores[1]),game(2,scores[2],scores[3])]);
    assert.deepEqual(teamPointsForMatch(value), expected);
    assert.equal(teamMatchProgress(value).gpA, null);
    assert.equal(teamMatchProgress(value).total, 2);
  }
});

test("Doubles pending results produce no bonus and no standing points", () => {
  const value = match(1,2,[game(1,20,4),game(2,1,18,"pending_confirmation")],"in_progress");
  assert.equal(doublesScoring(value).vpBonusA, null);
  assert.equal(teamMatchProgress(value).completed, 1);
  for (const row of teamStandings([{id:1},{id:2}],[value],null,tournament)) {
    assert.equal(row.teamTournamentPoints,0);
    assert.equal(row.totalVp,0);
  }
});

test("Doubles SOS retains withdrawn opponents and recalculates after correction", () => {
  const rosters = [{id:1,seed:1},{id:2,seed:2},{id:3,status:"withdrawn"}];
  const matches = [
    match(1,2,[game(1,20,4),game(2,1,18)]),
    match(1,3,[game(1,10,10),game(2,7,7)]),
    match(2,3,[game(1,10,8),game(2,6,8)])
  ];
  const standings = () => teamStandings(rosters.slice(0,2),matches,null,{...tournament,historicalRosters:rosters});
  let rows = standings();
  assert.equal(rows.find(row=>row.roster.id===1).strengthOfSchedule,9);
  assert.equal(rows.find(row=>row.roster.id===2).strengthOfSchedule,8);
  matches[0].games[1] = game(2,1,10);
  rows = standings();
  assert.equal(rows.find(row=>row.roster.id===1).strengthOfSchedule,8);
  assert.equal(rows.find(row=>row.roster.id===2).strengthOfSchedule,9);
});

test("Doubles constraints keep two slots, four missions, IRL and manual pairings", () => {
  const created = normalizeNewTournament({participantMode:"team",format:"swiss",pairingType:"doubles"},1,"doubles");
  assert.equal(created.teamSize,2);
  assert.equal(created.swissRoundCount,4);
  assert.equal(created.venueMode,"irl");
  assert.equal(created.captainPairingEnabled,false);
  assert.throws(()=>normalizeTournamentPatch({venueMode:"tts"},created));
  assert.throws(()=>normalizeTournamentPatch({captainPairingEnabled:true},created));
  assert.throws(()=>normalizeTournamentPatch({teamSize:3},created));
  assert.throws(()=>normalizeRoundMissions(CRIT_OPS.slice(0,3),"doubles"));
  assert.throws(()=>normalizeRoundMissions([...CRIT_OPS.slice(0,3),CRIT_OPS[2]],"doubles"));
  assert.equal(normalizeRoundMissions(CRIT_OPS.slice(0,4),"doubles").length,4);
  assert.throws(()=>validateTeamTournament({...tournament,status:"in_progress"},[{id:1},{id:2},{id:3}]));
  assert.equal(validateTeamLines([{tableNumber:1,deployment:1},{tableNumber:2,deployment:2}],"irl",2).length,2);
});

test("Classic and WTC retain three games and their existing scoring", () => {
  const games = [game(1,10,8),game(2,6,8),game(3,8,8)];
  const classic = {...match(1,2,games),pairingType:"sword_shield_classic"};
  assert.deepEqual(teamPointsForMatch(classic),{a:4,b:4});
  assert.equal(teamMatchProgress(classic).gpA,null);
  assert.equal(teamMatchProgress(classic).total,3);
  const wtc = {...classic,pairingType:"shield_sword"};
  assert.deepEqual(teamPointsForMatch(wtc),{a:1,b:1});
  assert.equal(teamMatchProgress(wtc).gpA,30);
  assert.equal(teamMatchProgress(wtc).total,3);
});
