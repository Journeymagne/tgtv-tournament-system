const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { seasons } = require("../../public/game-data");
const { inSeason, eligibleGames, summarizeTeam } = require("../../src/domain/kill-team-statistics");
const { createHandler } = require("../../src/api/kill-team-statistics");
const season = seasons[1], team = "Kasrkin";
function game(id, { opponent = "Legionaries", winnerId = 1, players, ...extra } = {}) {
  return { id, status: "completed", sourceType: "challenge", submittedAt: "2026-10-01T00:00:00Z",
    players: players || [{ id: 1, userId: 1, name: "Alpha" }, { id: 2, userId: 2, name: "Beta" }],
    result: { winnerId, scores: { 1: { faction: team, tacOp: "Plant Banner", tac: 4 },
      2: { faction: opponent, tacOp: "Retrieval", tac: 2 } } }, ...extra };
}
test("season membership matches the public screen at boundaries, tournament overrides and legacy timestamps", () => {
  const source = fs.readFileSync(require.resolve("../../public/app.js"), "utf8")
    .match(/function filterGamesBySeason\([^]*?\r?\n\}/)[0];
  const clientFilter = new Function(source + "; return filterGamesBySeason;")();
  const values = [
    game(1, { submittedAt: "2026-09-25T19:59:59Z" }),
    game(2, { submittedAt: "2026-09-25T20:00:00Z" }),
    game(3, { submittedAt: "", createdAt: "", result: { confirmedAt: "2026-09-25T19:59:59Z" } }),
    game(4, { submittedAt: "", createdAt: "" }), game(5, { submittedAt: "bad timestamp" }),
    game(6, { sourceType: "tournament_match", tournament: { seasonId: season.id }, submittedAt: "2020-01-01" }),
    game(7, { sourceType: "team_match_game", tournament: { seasonId: seasons[0].id } })
  ];
  for (const available of seasons) {
    assert.deepEqual(values.filter(item => inSeason(item, available)).map(item => item.id),
      clientFilter(values, available).map(item => item.id));
  }
});
test("completed published sources alone qualify; drafts, missing links and pending results are excluded", () => {
  const games = [game(1), game(2, { status: "pending_confirmation" }), game(3, { result: null }),
    game(4, { sourceType: "tournament_match", tournament: { id: 10 } }),
    game(5, { sourceType: "team_match_game", tournament: { id: 20 } }),
    game(6, { sourceType: "team_match_game" })];
  assert.deepEqual(eligibleGames(games, season, new Set([10])).map(item => item.id), [1, 4]);
});
test("mirrors count both appearances; draws stay in denominator and zero samples have null win rate", () => {
  const summary = summarizeTeam(team, [game(1, { opponent: team }), game(2, { winnerId: null })], season);
  assert.deepEqual([summary.games, summary.wins, summary.losses, summary.draws, summary.winRate], [3, 1, 1, 1, 33]);
  assert.equal(summary.matchGames, 2); assert.equal(summary.mirrorGames, 1);
  const empty = summarizeTeam("Dragon Masters", [game(1)], season);
  assert.equal(empty.winRate, null); assert.equal(empty.games, 0); assert.deepEqual(empty.topPlayers, []);
});
test("real players use userId while guests and proxies are scoped by tournament and historical identity", () => {
  const games = [
    game(1, { players: [{ id: 1, userId: 7, name: "Account" }, { id: 2, userId: 2, name: "Other" }] }),
    game(2, { players: [{ id: 1, userId: 7, name: "Account" }, { id: 2, userId: 2, name: "Other" }] }),
    game(3, { tournament: { id: 10 }, players: [{ id: 1, userId: null, isProxy: true, name: "Proxy" }, { id: 2 }] }),
    game(4, { tournament: { id: 20 }, players: [{ id: 1, userId: null, isProxy: true, name: "Proxy" }, { id: 2 }] })
  ];
  const top = summarizeTeam(team, games, season).topPlayers;
  assert.equal(top.length, 3);
  assert.deepEqual(top.map(row => row.games), [2, 1, 1]);
  assert.deepEqual(top.map(row => row.userId), [7, null, null]);
});
test("top players and tac ops use existing win-rate, wins, sample-size and points tie-breaks", () => {
  const games = Array.from({ length: 4 }, (_, i) => {
    const row = game(i + 1, { players: [{ id: 1, userId: i + 1, name: ["Zulu", "Beta", "Alpha", "Last"][i] }, { id: 2 }] });
    row.result.scores[1].tacOp = ["flank", "Plant Banner", "Retrieval", "Rout"][i];
    row.result.scores[1].tac = [1, 5, 3, 0][i];
    return row;
  });
  const summary = summarizeTeam(team, games, season);
  assert.deepEqual(summary.topPlayers.map(row => row.name), ["Alpha", "Beta", "Last"]);
  assert.deepEqual(summary.topTacOps.map(row => row.name), ["Plant Banner", "Retrieval", "Flank"]);
  assert.equal(summary.topTacOps[0].avgPoints, 5);
});
test("public aggregate cache shares one source load across teams, expires, and rejects invalid teams before I/O", async () => {
  let now = Date.parse("2026-10-01T00:00:00Z"), loads = 0;
  const get = createHandler({ clock: () => now, getSeason: () => season,
    loadCompleted: async () => { loads++; return { games: [game(1)] }; }, loadPublishedIds: async () => new Set() });
  const request = name => get({ query: new URLSearchParams({ team: name }) });
  await assert.rejects(() => request("not-a-team"), error => error.status === 400);
  assert.equal(loads, 0);
  const [a, b] = await Promise.all([request(team), request("Legionaries")]);
  assert.equal(loads, 1); assert.equal(a.body.wins, 1); assert.equal(b.body.losses, 1);
  assert.equal(a.headers["Cache-Control"], "public, max-age=60");
  now += 59_000; await request(team); assert.equal(loads, 1);
  now += 1_000; await request(team); assert.equal(loads, 2);
});
test("cache changes at season rollover and never caches a failed load", async () => {
  let active = seasons[0], loads = 0, fail = true;
  const get = createHandler({ getSeason: () => active, clock: () => Date.parse("2026-09-25T19:59:30Z"),
    loadCompleted: async () => { loads++; if (fail) throw Error("database unavailable"); return { games: [] }; },
    loadPublishedIds: async () => new Set() });
  const ctx = { query: new URLSearchParams({ team }) };
  await assert.rejects(() => get(ctx), /database unavailable/);
  fail = false;
  assert.equal((await get(ctx)).headers["Cache-Control"], "public, max-age=30");
  active = season;
  assert.equal((await get(ctx)).body.season.id, season.id);
  assert.equal(loads, 3);
});

test("legacy challenge ids merge real players while hidden profiles and guest namespaces never link", () => {
  const legacy = id => game(id, { players: [{ id: 1, name: "Legacy account" }, { id: 2, name: "Other" }] });
  const legacySummary = summarizeTeam(team, [legacy(1), legacy(2)], season);
  assert.equal(legacySummary.topPlayers[0].userId, 1);
  assert.equal(legacySummary.topPlayers[0].games, 2);
  const guest = (id, sourceType) => game(id, { sourceType, tournament: { id: 9 },
    players: [{ id: 1, userId: 123, hasProfile: false, name: "No profile" }, { id: 2 }] });
  const top = summarizeTeam(team, [guest(3, "tournament_match"), guest(4, "team_match_game")], season).topPlayers;
  assert.equal(top.length, 2);
  assert.ok(top.every(row => row.userId === null && row.games === 1));
});
test("a slow load that crosses season end cannot publish the old season with a fresh cache lifetime", async () => {
  let now = Date.parse("2026-09-25T19:59:59Z");
  const get = createHandler({ clock: () => now,
    loadCompleted: async () => { now += 2_000; return { games: [] }; },
    loadPublishedIds: async () => new Set() });
  const ctx = { query: new URLSearchParams({ team }) };
  const old = await get(ctx);
  assert.equal(old.body.season.id, seasons[0].id);
  assert.equal(old.headers["Cache-Control"], "public, max-age=0");
  const next = await get(ctx);
  assert.equal(next.body.season.id, season.id);
  assert.equal(next.headers["Cache-Control"], "public, max-age=60");
});
