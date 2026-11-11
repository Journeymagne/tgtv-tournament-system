const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { migrate } = require("../../src/db/migrate");
const { currentSeason, seasons } = require("../../public/game-data");
const { createHandler } = require("../../src/api/kill-team-statistics");
const users = require("../../src/db/repositories/users");
const games = require("../../src/db/repositories/games");
const tournaments = require("../../src/api/tournaments");
let pool, client, admin, alpha, beta;
const season = currentSeason(), oldSeason = seasons.find(item => item.id !== season.id);
async function tx(fn) {
  await client.query("BEGIN");
  try { const value = await fn(); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
}
async function user(name, isAdmin = false) {
  return users.insert(client, { name, passwordHash: "test-only", registerNickname: "", telegramContact: "@test",
    rating: 1000, isAdmin });
}
function scores(a, b) {
  return { [a]: { crit: 6, kill: 5, tac: 4, primary: "crit", faction: "Kasrkin", tacOp: "Plant Banner" },
    [b]: { crit: 1, kill: 1, tac: 1, primary: "kill", faction: "Legionaries", tacOp: "Retrieval" } };
}
async function completedChallenge(date = "2026-10-01T00:00:00Z") {
  const game = await games.insert(client, { challengeId: null, playerIds: [alpha.id, beta.id] });
  await games.saveFinalResult(client, game.id, { result: { winnerId: alpha.id, scores: scores(alpha.id, beta.id) } });
  await client.query("UPDATE games SET submitted_at=$2 WHERE id=$1", [game.id, date]);
  return game;
}
async function completedTournament(name, selectedSeason = season.id) {
  const created = await tx(() => tournaments.createAdmin({ client, user: admin, body: {
    name, description: "Public test tournament.", gameSystem: "Warhammer 40k Kill Team",
    startsAt: "2026-10-01T10:00:00Z", rulesSummary: "Test rules", rulesLink: "https://example.com/rules",
    format: "swiss", swissRoundCount: 1, ratingPolicy: "unranked", seasonId: selectedSeason, venueMode: "irl"
  } }));
  const id = created.body.tournament.id, params = { id: String(id) };
  await tx(() => tournaments.publishAdmin({ client, user: admin, params, body: { status: "registration_open" } }));
  // Swiss needs four active participants; only one match is completed.
  const extras = [await user(name + " Extra A"), await user(name + " Extra B")];
  for (const person of [alpha, beta, ...extras]) {
    await tx(() => tournaments.addParticipant({ client, user: admin, params, body: { userId: person.id } }));
  }
  await tx(() => tournaments.closeRegistration({ client, user: admin, params }));
  await tx(() => tournaments.generateNextRoundAdmin({ client, user: admin, params }));
  const view = await tx(() => tournaments.startAdmin({ client, user: admin, params }));
  const match = view.rounds[0].matches.find(item => !item.isBye &&
    [item.participantA.userId, item.participantB.userId].includes(alpha.id));
  const a = alpha.id;
  const b = match.participantA.userId === a ? match.participantB.userId : match.participantA.userId;
  await tx(() => tournaments.saveMatchResultAdmin({ client, user: admin,
    params: { ...params, matchId: String(match.id) }, body: { scores: scores(a, b) } }));
  return id;
}
function request(get, team = "Kasrkin") { return get({ client, query: new URLSearchParams({ team }) }); }
test.before(async () => {
  pool = new Pool(require("../helpers/schema").poolOptions);
  await require("../helpers/schema").resetSchemas(pool); await migrate(pool);
});
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("TRUNCATE accounts.users RESTART IDENTITY CASCADE");
  admin = await user("StatsAdmin", true); alpha = await user("StatsAlpha"); beta = await user("StatsBeta");
});
test.afterEach(() => client.release());

test("guest endpoint aggregates real completed games, restricts tournament results to published current-season events", async () => {
  await completedChallenge();
  await completedChallenge("2026-08-01T00:00:00Z");
  const visible = await completedTournament("Published stats");
  const hidden = await completedTournament("Hidden stats");
  await client.query("UPDATE tournaments SET status='draft' WHERE id=$1", [hidden]);
  await completedTournament("Past season stats", oldSeason.id);
  const response = await request(createHandler());
  assert.equal(response.body.team, "Kasrkin");
  assert.equal(response.body.season.id, season.id);
  assert.equal(response.body.games, 2);
  assert.equal(response.body.wins, 2);
  assert.equal(response.body.topTacOps[0].name, "Plant Banner");
  assert.equal(response.body.topTacOps[0].avgPoints, 4);
  assert.ok(response.body.topPlayers.every(player => [alpha.id, beta.id].includes(player.userId)));
  // Tournament selection wins over date: this old timestamp is still in the current season.
  await client.query("UPDATE games SET submitted_at='2026-08-01T00:00:00Z' WHERE source_id IN (SELECT id FROM tournament_matches WHERE tournament_id=$1) AND source_type='tournament_match'", [visible]);
  assert.equal((await request(createHandler())).body.games, 2);
});
test("zero-game canonical team is valid and private account fields never enter the response", async () => {
  const response = await request(createHandler(), "Dragon Masters");
  assert.equal(response.body.games, 0); assert.equal(response.body.winRate, null);
  assert.deepEqual(response.body.topTacOps, []); assert.deepEqual(response.body.topPlayers, []);
  await completedChallenge();
  const full = await request(createHandler());
  assert.doesNotMatch(JSON.stringify(full.body), /password|telegram|registerNickname|csrfToken|email/i);
});
test("the public statistics route lives only in tournaments, without loading the account", () => {
  const routes = require("../../src/api/routes-tournaments");
  const route = routes.find(item => item.path === "/api/statistics/kill-team");
  assert.ok(route); assert.equal(route.auth, "none"); assert.ok(!route.loadUser);
  assert.ok(!require("../../src/api/routes-tierlists").some(item => item.path === route.path));
});
