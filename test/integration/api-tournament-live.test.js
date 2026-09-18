const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const cups = require("../../src/api/tournaments");
const teams = require("../../src/api/team-tournaments");
const users = require("../../src/db/repositories/users");
const clubs = require("../../src/db/repositories/player-teams");
const matches = require("../../src/db/repositories/team-matches");
const games = require("../../src/db/repositories/games");
const live = require("../../src/api/tournament-live");
const { saveTableImage } = require("../../src/api/tournament-table-images");
const { pngImage } = require("../helpers/png");
let pool, client, admin, otherAdmin;
const PNG = `data:image/png;base64,${pngImage(300, 200).toString("base64")}`;
const tableSetup = [{ killzone: "Volkus", deployment: 1, imageData: PNG }, { killzone: "Gallowdark", deployment: 2 }, { killzone: "Octarius", deployment: 3 }];
const context = (cup, body = {}, user = admin) => ({ client, user, params: { id: cup.id }, body });
test.before(async () => { pool = new Pool({ connectionString: TEST_DATABASE_URL }); await migrate(pool); });
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  admin = await person("Live Admin", true);
  otherAdmin = await person("Other Admin", true);
});
test.afterEach(() => client.release());
async function person(name, isAdmin = false) { return users.insert(client, { name, passwordHash: "s:h", isAdmin, rating: 1000 }); }
async function club(n) {
  const people = await Promise.all([0, 1, 2].map(slot => person(`Player ${n} ${slot}`)));
  const team = await clubs.insert(client, { name: `Club ${n}`, nameKey: `club ${n}`, slug: `club-${n}`, leaderUserId: people[0].id, logoData: PNG });
  for (const [index, player] of people.entries()) await clubs.addMembership(client, team.id, player, index ? "member" : "leader");
  return { team, people, body: { teamId: team.id, captainUserId: people[0].id, members: people.map(player => ({ userId: player.id, faction: "Kommandos" })) } };
}
async function cup(limit = null) {
  const { body: { tournament } } = await cups.createAdmin({ client, user: admin, body: {
    name: "Live cup", description: "Tournament live tests", startsAt: "2026-09-19T12:00:00Z", format: "swiss", swissRoundCount: 3,
    participantMode: "team", teamSize: 3, registrationLimit: limit, logoData: PNG
  } });
  await cups.publishAdmin(context(tournament, { status: "registration_open" }));
  return tournament;
}

test("reserved rosters occupy capacity and are filled in place before start", async () => {
  const tournament = await cup(1);
  const group = await club(1);
  await assert.rejects(() => teams.registerRoster(context(tournament, { reserve: true, name: "Slot" }, group.people[1])), error => error.status === 403);
  const { body: { roster } } = await teams.registerRoster(context(tournament, { reserve: true, name: "Reserved slot" }));
  assert.equal(roster.isReserve, true);
  assert.equal(roster.members.length, 0);
  assert.equal((await cups.getPublic({ ...context(tournament), params: { slug: tournament.slug } })).rosters[0].id, roster.id);
  await assert.rejects(() => teams.registerRoster(context(tournament, group.body)), /Registration limit/);
  await cups.closeRegistration(context(tournament));
  await assert.rejects(() => cups.generateNextRoundAdmin(context(tournament, { tables: tableSetup })), /Incomplete/);
  await client.query("UPDATE tournament_team_rosters SET paid=TRUE WHERE id=$1", [roster.id]);
  const filled = await teams.updateRoster({ ...context(tournament, group.body, otherAdmin), params: { id: tournament.id, rosterId: roster.id } });
  assert.equal(filled.roster.id, roster.id);
  assert.equal(filled.roster.seed, roster.seed);
  assert.equal(filled.roster.paid, true);
  assert.equal(filled.roster.isReserve, false);
  assert.equal(filled.roster.members.length, 3);
});

test("non-owner admin restores first-round pairs and images; all roster members can follow pairing", async () => {
  const tournament = await cup();
  const groups = [];
  for (let n = 0; n < 4; n++) { const group = await club(n); groups.push(group); await teams.registerRoster(context(tournament, group.body)); }
  await cups.closeRegistration(context(tournament, {}, otherAdmin));
  const generated = await cups.generateNextRoundAdmin(context(tournament, { tables: tableSetup }, otherAdmin));
  await cups.startAdmin(context(tournament, {}, otherAdmin));
  const snapshot = await live.logo({ client, params: { kind: "roster", id: generated.rosters[0].id } });
  assert.deepEqual(snapshot.buffer, pngImage(300, 200), "starting must retain the stored logo, not save its display URL");
  for (const player of groups[0].people) assert.equal((await matches.listActivePairingsForCaptain(client, player.id)).length, 1);
  assert.equal((await matches.listActivePairingsForCaptain(client, otherAdmin.id)).length, 0);
  const first = generated.teamMatches[0];
  await assert.rejects(() => teams.roll({ ...context(tournament, {}, groups[0].people[1]), params: { id: tournament.id, matchId: first.id } }), error => error.status === 403);
  const rolled = await cups.rollbackLatestRoundAdmin(context(tournament, {}, otherAdmin));
  assert.equal(rolled.rounds.length, 0);
  assert.equal(rolled.tournament.roundDraft.tables[0].imageId, generated.tables[0].imageId);
  await assert.rejects(() => cups.rollbackLatestRoundAdmin(context(tournament)), /Finish editing the restored round/);
  const restored = await cups.generateNextRoundAdmin(context(tournament, {}, otherAdmin));
  assert.deepEqual(restored.teamMatches.map(m => [m.rosterAId, m.rosterBId]), generated.teamMatches.map(m => [m.rosterAId, m.rosterBId]));
  assert.equal(restored.tables[0].imageId, generated.tables[0].imageId);
  assert.equal(restored.tournament.roundDraft, null);
  const match = restored.teamMatches[0];
  const game = await games.insert(client, { sourceType: "team_match_game", sourceId: match.id, playerIds: [match.rosterA.members[0].userId, match.rosterB.members[0].userId] });
  await matches.insertGameLink(client, { teamMatchId: match.id, gameId: game.id, slot: 1, rosterAMemberId: match.rosterA.members[0].id, rosterBMemberId: match.rosterB.members[0].id, mission: {} });
  await client.query("UPDATE games SET status='pending_confirmation', pending_result='{}' WHERE id=$1", [game.id]);
  await assert.rejects(() => cups.rollbackLatestRoundAdmin(context(tournament)), /submitted team-match results/);
  assert.ok(await games.findById(client, game.id));
});

test("images survive terrain changes; compact replies do not repeat image data or match rosters", async () => {
  const tournament = await cup();
  const group = await club(1);
  await teams.registerRoster(context(tournament, group.body));
  const imageId = await saveTableImage(client, tournament.id, tableSetup[0]);
  assert.equal(await saveTableImage(client, tournament.id, { killzone: "Octarius", deployment: 6 }, { imageId, killzone: "Volkus", deployment: 1 }), imageId);
  assert.equal(await saveTableImage(client, tournament.id, { killzone: "Octarius", deployment: 6, imageId: null }, { imageId }), null);
  const full = await cups.getAdmin(context(tournament));
  const compact = await cups.getAdmin({ ...context(tournament), query: new URLSearchParams("compact=1") });
  assert.equal(compact.compactTeamTournament, true);
  assert.ok(!JSON.stringify(compact).includes("data:image"));
  assert.deepEqual(full.auditEvents, []);
  const image = await live.logo({ client, params: { kind: "tournament", id: tournament.id }, user: null });
  assert.deepEqual(image.buffer, pngImage(300, 200));
  const cached = await live.logo({ client, params: { kind: "tournament", id: tournament.id }, req: { headers: { "if-none-match": image.headers.ETag } } });
  assert.equal(cached.status, 304);
});

test("revision observes committed changes and stale admin edits are rejected", async () => {
  const tournament = await cup();
  const before = await live.revision({ client });
  const writer = await pool.connect();
  try {
    await writer.query("BEGIN");
    await writer.query("UPDATE tournaments SET name='Pending name' WHERE id=$1", [tournament.id]);
    const pending = await live.revision({ client });
    await writer.query("COMMIT");
    const committed = await live.revision({ client });
    assert.notEqual(before.revision, committed.revision);
    assert.notEqual(pending.revision, committed.revision, "a revision fetched before commit must not hide the subsequent commit");
  } finally { await writer.query("ROLLBACK"); writer.release(); }
  const current = await cups.getAdmin(context(tournament));
  await cups.updateAdmin(context(tournament, { name: "Other edit", expectedUpdatedAt: current.tournament.updatedAt }, otherAdmin));
  await assert.rejects(() => cups.updateAdmin(context(tournament, { name: "Stale edit", expectedUpdatedAt: current.tournament.updatedAt })), error => error.status === 409);
});
