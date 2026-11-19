const test = require("node:test");
const assert = require("node:assert/strict");
const { buildEventContributions } = require("../../src/domain/leagues/event-contributions");
const { buildLeagueStandings } = require("../../src/domain/leagues/standings");
const { leaguePick } = require("../../src/domain/leagues/picks");
const { KILL_TEAMS } = require("../../src/domain/kill-teams");
const { resolveTournamentOrder, validateLeagueRules } = require("../../src/domain/leagues/rules");

const tp = { primary: "tp", criteria: [] };
const place = { primary: "place", scale: [10, 8, 6, 4, 0], criteria: [] };
const team = { participantMode: "team" };

test("effective tournament orders preserve an empty selection and the WTC average", () => {
  assert.deepEqual(resolveTournamentOrder({ ...team, pairingType: "doubles" }), ["strength_of_schedule", "total_vp"]);
  assert.deepEqual(resolveTournamentOrder({ ...team, teamTiebreakerOrder: [] }), []);
  assert.deepEqual(resolveTournamentOrder({ ...team, pairingType: "wtc_doubles" }), ["individual_wins", "average_sos", "total_vp", "tac_op"]);
  assert.throws(() => validateLeagueRules({ ...tp, criteria: ["average_sos"] }, [{ ...team, pairingType: "doubles" }]));
  assert.throws(() => validateLeagueRules({ ...place, scale: [8, 10, 0] }));
});

function solo(id, data) {
  return {
    tournament: { id, name: "Cup " + id, status: "completed",
      finalResults: data.map(([participantId, , , rank, matchPoints, totalVp, strengthOfSchedule]) =>
        ({ participantId, rank, matchPoints, totalVp, strengthOfSchedule })) },
    participants: data.map(([id, userId, displayName]) => ({ id, userId, displayName, status: "finished" }))
  };
}

test("registry identity retains nick history across events and league order changes tied ranks", () => {
  const bindings = { byUser: new Map([[1, { id: 10, userId: 1, registerNickname: "Rook" }],
    [2, { id: 20, userId: 2, registerNickname: "Mira" }]]) };
  const events = [solo(5, [[11, 1, "Ворон", 1, 9, 43, 12], [12, 2, "Mira", 2, 6, 45, 14]]),
    solo(6, [[21, 2, "Mira", 1, 9, 42, 11], [22, 1, "Raven_17", 2, 6, 49, 9]])];
  function rank(metric, aggregate) {
    const rule = validateLeagueRules({ ...tp, criteria: [{ metric, aggregate }] });
    const contributions = events.flatMap(bundle => buildEventContributions(bundle, bindings, rule).contributions);
    return buildLeagueStandings(contributions, [], rule);
  }
  const [rook] = rank("total_vp", "sum");
  assert.deepEqual([rook.name, rook.points, rook.eventCount, rook.criteriaValues], ["Rook", 15, 2, [92]]);
  assert.deepEqual(rook.history.map(item => item.displayName).sort(), ["Raven_17", "Ворон"].sort());
  assert.equal(rank("strength_of_schedule", "sum")[0].name, "Mira");
  assert.deepEqual(rank("total_vp", "max")[0].criteriaValues, [49]);
});

test("all rosters earn place points and a custom best value sums rosters inside each event", () => {
  const bundle = (id, list) => ({
    tournament: { ...team, status: "completed", id, finalResults: list.map(([rosterId, rank, totalVp]) => ({ rosterId, rank, totalVp })) },
    rosters: list.map(([id]) => ({ id, name: "FM " + id, teamId: 7, teamNameSnapshot: "Fresh Meat" }))
  });
  const rule = validateLeagueRules({ ...place, criteria: [{ name: "Best VP", metric: "total_vp", aggregate: "max" }] });
  const stages = [bundle(4, [[91, 2, 23]]), bundle(5, [[92, 1, 17], [93, 3, 10]])]
    .map(event => buildEventContributions(event, {}, rule).contributions);
  const [row] = buildLeagueStandings(stages.flat(), [], rule);
  assert.deepEqual([row.points, row.eventCount, row.criteriaValues, row.history.length], [24, 2, [27], 3]);
  assert.equal(buildLeagueStandings(stages[0], [], rule)[0].points, 8);
});

test("missing required source data quarantines the stage while genuine zero is scored", () => {
  const bundle = solo(1, [[10, 1, "A", 1, 0, 0, 0], [20, 2, "B", 2, undefined, 0, 0]]);
  assert.equal(buildEventContributions(bundle).status, "needs_data");
  assert.deepEqual(buildEventContributions(bundle).contributions, []);
  bundle.tournament.finalResults[1].matchPoints = 0;
  assert.equal(buildEventContributions(bundle).contributions.length, 2);
  bundle.tournament.status = "in_progress";
  assert.equal(buildEventContributions(bundle).status, "pending");
});

test("pick vocabulary covers every canonical team with a unique code and preserves unknown text", () => {
  const picks = KILL_TEAMS.map(name => leaguePick(name));
  assert.equal(new Set(picks.map(pick => pick.code)).size, 48);
  assert.ok(picks.every(pick => /^[A-Za-z0-9]{2,3}$/.test(pick.code)));
  assert.equal(leaguePick("angel of death").code, "AoD");
  assert.deepEqual(leaguePick("Archived faction"), { name: "Archived faction", code: null, side: "unknown", declared: false });
});

function soloGame(id, a, b, winner, vpA, vpB, sideA = {}) {
  return { id, status: "completed", participantAId: a, participantBId: b, winnerParticipantId: winner,
    participantSnapshots: { [a]: sideA },
    result: { scoresByParticipantId: { [a]: { total: vpA, tac: 2, faction: "angel of death" },
      [b]: { total: vpB, tac: 3, faction: "Blades of Khaine" } } } };
}

test("shared solo slot awards match points and actual opponents to each player and reserves the place once", () => {
  const bundle = solo(8, [[10, 101, "Final player", 1, 6, 13, 9], [20, 200, "B", 2, 0, 7, 6], [30, 300, "C", 3, 9, 10, 6]]);
  bundle.replacedParticipantIds = [10];
  bundle.matches = [soloGame(1, 10, 20, 10, 8, 7, { userId: 100, displayName: "Original player" }),
    soloGame(2, 10, 30, 30, 5, 10),
    { id: 3, status: "completed", participantAId: 10, winnerParticipantId: 10, isBye: true,
      participantSnapshots: { 10: { userId: 100, displayName: "Original player" } } }];
  const bindings = { byUser: new Map([[100, { id: 1, userId: 100, registerNickname: "One" }],
    [101, { id: 2, userId: 101, registerNickname: "Two" }]]) };
  const outcome = buildEventContributions(bundle, bindings);
  assert.equal(outcome.status, "counted");
  const appearances = outcome.contributions.filter(row => row.participantId === 10);
  assert.deepEqual(appearances.map(row => [row.name, row.rawTp, row.metrics.total_vp, row.metrics.strength_of_schedule, row.metrics.buchholz]),
    [["One", 6, 8, 0, 0], ["Two", 0, 5, 9, 0]]);
  const unconfirmed = buildEventContributions(bundle, bindings, place);
  assert.equal(unconfirmed.issues.filter(issue => issue.code === "place_recipient").length, 1);
  assert.ok(unconfirmed.contributions.filter(row => row.participantId === 10).every(row => !row.awardPlace));
  const confirmed = buildEventContributions(bundle, { ...bindings, recipients: new Map([["8:10", 2]]) }, place);
  const standings = buildLeagueStandings(confirmed.contributions, confirmed.encounters, place);
  assert.deepEqual(standings.filter(r => ["One", "Two"].includes(r.name)).map(r => [r.name, r.points, r.eventCount]),
    [["Two", 10, 1], ["One", 0, 1]]);
});

test("same-key proxies stay distinct after substitution, and correction reunites exactly their own matches", () => {
  const bundle = solo(9, [[10, null, "Proxy", 1, 6, 20, 0], [20, 200, "Opponent", 2, 0, 5, 6]]);
  bundle.replacedParticipantIds = [10];
  bundle.matches = [soloGame(1, 10, 20, 10, 10, 2), soloGame(2, 10, 20, 10, 10, 3)];
  const guests = buildEventContributions(bundle).contributions.filter(row => row.participantId === 10);
  assert.equal(guests.length, 2);
  assert.notEqual(guests[0].sourceKey, guests[1].sourceKey);
  const person = { id: 55, confirmed: true, registerNickname: "Confirmed" };
  const rebound = buildEventContributions(bundle, { bySource: new Map(guests.map(row => [row.sourceKey, person])) });
  const confirmed = buildLeagueStandings(rebound.contributions, rebound.encounters, tp).find(row => row.subjectKey === "person:55");
  assert.deepEqual([confirmed.points, confirmed.eventCount, confirmed.picks.map(p => p.code)], [6, 1, ["AoD"]]);
  bundle.replacedParticipantIds = [];
  const single = buildEventContributions(bundle);
  assert.equal(single.contributions.filter(row => row.participantId === 10).length, 1);
  assert.deepEqual(single.identities.filter(i => i.participantId === 10).map(i => i.sourceKey), guests.map(g => g.sourceKey));
});

test("head-to-head counts only opponents left tied by earlier criteria; unresolved places skip their number", () => {
  const rows = ["A", "B", "C", "D"].map((name, index) => ({ tournamentId: 1, subjectKey: name, name, rawTp: 6,
    metrics: { total_vp: [25, 20, 20, 20][index] }, picks: [] }));
  const games = [{ a: "A", b: "C", winner: "C" }, { a: "A", b: "D", winner: "D" }, { a: "B", b: "C", winner: "B" }];
  const order = buildLeagueStandings(rows, games, { ...tp, criteria: ["total_vp", "head_to_head"] });
  assert.deepEqual(order.map(row => [row.name, row.rank, row.criteriaValues[1]]), [["A", 1, 0], ["B", 2, 1], ["C", 3, 0], ["D", 3, 0]]);
  const before = buildLeagueStandings(rows, [], tp);
  assert.deepEqual(before.map(row => row.rank), [1, 1, 1, 1]);
  rows[0].rawTp = 0;
  assert.deepEqual(buildLeagueStandings(rows, [], tp).map(row => row.rank), [1, 1, 1, 4]);
});

test("only the actual faction is marked played and multi-faction declarations remain unknown", () => {
  const bundle = solo(10, [[5, 50, "A", 1, 3, 12, 0], [6, 60, "B", 2, 0, 4, 3], [7, 70, "C", 3, 0, 0, 0]]);
  bundle.participants[0].factions = ["Kasrkin", "Kommandos"];
  bundle.participants[1].factions = ["Ratlings"];
  bundle.participants[2].factions = ["Kasrkin", "Ratlings"];
  const match = soloGame(150, 5, 6, 5, 12, 4);
  delete match.participantSnapshots;
  delete match.result.scoresByParticipantId[6].faction;
  bundle.matches = [match];
  assert.deepEqual(buildEventContributions(bundle).contributions.map(row => row.picks.map(p => [p.code, p.declared])),
    [[["AoD", false]], [["RT", true]], []]);
});

test("legacy recovery uses format scoring, exact WTC opponent average and historical member picks", () => {
  const tournament = { id: 20, status: "completed", ...team, pairingType: "wtc_doubles", finalResults:
    [{ rosterId: 1, rank: 2 }, { rosterId: 2, rank: 1, teamTournamentPoints: 5 }, { rosterId: 3, rank: 3, teamTournamentPoints: 2 }] };
  const rosters = [1, 2, 3].map(id => ({ id, teamId: 40 + id, name: "Roster " + id, members: [{ id: 10 * id, displayNameSnapshot: "Player" }] }));
  const games = id => [1, 2].map(slot => ({ slot, rosterAMemberId: 10, rosterBMemberId: id * 10,
    game: { status: "completed", resultPlayerIds: [17, -23], result: { scores: {
      17: { total: 14, tac: 3, faction: "Fellgor Ravagers" }, "-23": { total: 9, tac: 2, faction: "Mandrakes" }
    } } } }));
  const teamMatches = [2, 3, 2].map((id, i) => ({ id: i + 1, phase: "completed", pairingType: "wtc_doubles",
    rosterAId: 1, rosterBId: id, games: games(id) }));
  const rule = { ...tp, criteria: ["average_sos", "tac_op"] };
  const event = buildEventContributions({ tournament, rosters, teamMatches }, {}, rule);
  const row = event.contributions.find(item => item.rosterId === 1);
  assert.equal(event.status, "counted");
  assert.deepEqual([row.rawTp, row.metrics.average_sos, row.metrics.tac_op], [6, 4, 18]);
  assert.deepEqual(row.members[0].picks.map(p => p.code), ["FR"]);
  tournament.finalResults[1].teamTournamentPoints = 6;
  const changed = buildEventContributions({ tournament, rosters, teamMatches }, {}, rule);
  assert.equal(changed.contributions[0].metrics.average_sos, 14 / 3);
  delete teamMatches[0].games[0].game.result.scores[17].tac;
  assert.equal(buildEventContributions({ tournament, rosters, teamMatches }, {}, rule).status, "needs_data");
});


