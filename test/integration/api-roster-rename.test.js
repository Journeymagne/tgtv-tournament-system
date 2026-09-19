const test = require("node:test");
const assert = require("node:assert/strict");
const { TEST_DATABASE_URL } = require("../helpers/db");
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool, withClient, withTransaction } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const { createRateLimiter } = require("../../src/http/rate-limit");
const { loadUserFromRequest } = require("../../src/api/auth");
const routes = require("../../src/api/routes");
const { startApiServer, createClient } = require("../helpers/client");
let server, admin, leader, players, cup, roster, otherRoster;
const authLimiter = createRateLimiter({ max: 1000, windowMs: 60000 });

async function expect(request, status = 200) {
  const response = await request;
  assert.equal(response.status, status, JSON.stringify(response.body));
  return response.body;
}
async function register(name) {
  const http = createClient(server.baseUrl);
  const { user } = await expect(http.post("/api/register", { name, password: "password123", confirmPassword: "password123", telegramContact: `@${name}` }), 201);
  return { ...user, http };
}
const url = () => `/api/tournaments/${cup.id}/rosters/${roster.id}`;
const rename = (person, name) => person.http.patch(url(), { name });
const profile = (person) => expect((person?.http || createClient(server.baseUrl)).get(`/api/rosters/${roster.id}`));

test.before(async () => {
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await getPool().query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  authLimiter.reset();
  admin = await register("RenameAdmin");
  leader = await register("RenameLeader");
  const { team } = await expect(leader.http.post("/api/teams", { name: "Rename Team" }), 201);
  players = [];
  for (let i = 0; i < 6; i++) {
    const person = await register(`RenamePlayer${i}`);
    players.push(person);
    const { invitation } = await expect(leader.http.post(`/api/teams/${team.id}/invitations`, { userId: person.id }), 201);
    await expect(person.http.post(`/api/team-invitations/${invitation.id}/accept`));
  }
  ({ tournament: cup } = await expect(admin.http.post("/api/admin/tournaments", {
    name: "Rename Cup", startsAt: "2026-09-19T10:00:00.000Z", format: "swiss", swissRoundCount: 1, participantMode: "team", teamSize: 3
  }), 201));
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/publish`));
  const rosters = [];
  for (const offset of [0, 3]) {
    const captain = players[offset];
    const result = await expect(captain.http.post(`/api/tournaments/${cup.id}/rosters`, {
      teamId: team.id, name: `Roster ${offset}`, captainUserId: captain.id,
      members: players.slice(offset, offset + 3).map(person => ({ userId: person.id, faction: "Kommandos" }))
    }), 201);
    rosters.push(result.roster);
  }
  [roster, otherRoster] = rosters;
});

async function prepareRound() {
  // Team Swiss requires at least four rosters.
  for (const index of [2, 3]) {
    const additional = [];
    for (let slot = 0; slot < 3; slot++) {
      const person = await register(`Extra${index}Player${slot}`);
      const { invitation } = await expect(leader.http.post(`/api/teams/${roster.teamId}/invitations`, { userId: person.id }), 201);
      await expect(person.http.post(`/api/team-invitations/${invitation.id}/accept`));
      additional.push(person);
    }
    await expect(additional[0].http.post(`/api/tournaments/${cup.id}/rosters`, {
      teamId: roster.teamId, captainUserId: additional[0].id,
      members: additional.map(person => ({ userId: person.id, faction: "Kommandos" }))
    }), 201);
  }
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`));
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/rounds/next`, {
    tables: [{ killzone: "Volkus", deployment: 1 }, { killzone: "Gallowdark", deployment: 2 }, { killzone: "Octarius", deployment: 3 }]
  }));
}
async function preservedData() {
  const tables = ["tournament_rounds", "tournament_team_matches", "tournament_team_roster_members", "games"];
  const rows = {};
  for (const table of tables) rows[table] = (await getPool().query(`SELECT * FROM ${table} ORDER BY id`)).rows;
  rows.rosters = (await getPool().query("SELECT id, captain_user_id, seed, status FROM tournament_team_rosters ORDER BY id")).rows;
  rows.ratings = (await getPool().query("SELECT id, rating_tts, rating_irl FROM player_teams ORDER BY id")).rows;
  return rows;
}

test("roster captain and team leader outside the roster can rename; guests, members and other captains cannot", async () => {
  for (const person of [admin, leader, players[0]]) {
    assert.equal((await profile(person)).viewer.canRename, true);
    const name = `Renamed by ${person.name}`;
    assert.equal((await expect(rename(person, name))).roster.name, name);
    assert.equal((await profile(person)).roster.name, name);
  }
  for (const person of [players[1], players[3]]) {
    assert.equal((await profile(person)).viewer.canRename, false);
    await expect(rename(person, "Forbidden"), 403);
  }
  assert.equal((await profile()).viewer.canRename, false);
  await expect(createClient(server.baseUrl).patch(url(), { name: "Forbidden" }), 401);
  // A leader of another team has no authority over this team's rosters.
  const outsider = await register("OtherLeader");
  await expect(outsider.http.post("/api/teams", { name: "Other Team" }), 201);
  assert.equal((await profile(outsider)).viewer.canRename, false);
  await expect(rename(outsider, "Forbidden"), 403);
  const audit = (await getPool().query("SELECT actor_user_id, before, after FROM player_team_audit_events WHERE event_type = 'roster_update' ORDER BY id")).rows;
  assert.deepEqual(audit.map(row => row.actor_user_id), [admin.id, leader.id, players[0].id]);
  assert.equal(audit[0].before.name, roster.name);
  assert.equal(audit.at(-1).after.name, `Renamed by ${players[0].name}`);
});

test("renaming preserves prepared and live rounds, members, captain and scores; other changes stay admin-only after start", async () => {
  await prepareRound();
  const prepared = await preservedData();
  await expect(rename(leader, "Prepared roster"));
  assert.deepEqual(await preservedData(), prepared);
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/start`));
  await withTransaction(async client => {
    const games = require("../../src/db/repositories/games");
    const matches = require("../../src/db/repositories/team-matches");
    const rosters = require("../../src/db/repositories/team-rosters");
    const match = (await matches.listByTournament(client, cup.id)).find(row => row.rosterAId === roster.id || row.rosterBId === roster.id);
    const a = (await rosters.findById(client, match.rosterAId)).members[0];
    const b = (await rosters.findById(client, match.rosterBId)).members[0];
    const game = await games.insert(client, { sourceType: "team_match_game", sourceId: match.id, playerIds: [a.userId, b.userId] });
    await matches.insertGameLink(client, { teamMatchId: match.id, gameId: game.id, slot: 1, rosterAMemberId: a.id, rosterBMemberId: b.id, mission: {} });
    await games.saveFinalResult(client, game.id, {
      result: { winnerId: a.userId, scores: { [a.userId]: { total: 15, tac: 5 }, [b.userId]: { total: 5, tac: 1 } } },
      elo: {}, submittedBy: admin.id, newSubmission: true
    });
  });
  const started = await preservedData();
  for (const person of [players[0], leader]) {
    assert.equal((await profile(person)).viewer.canRename, true);
    await expect(rename(person, `Live ${person.name}`));
    for (const patch of [{ members: [] }, { captainUserId: players[1].id }, { name: "Hidden member change", members: [] }, { name: "Hidden status change", status: "withdrawn" }]) {
      await expect(person.http.patch(url(), patch), 403);
    }
  }
  await expect(rename(players[3], "Wrong captain"), 403);
  assert.deepEqual(await preservedData(), started);
  const detail = await expect(admin.http.get(`/api/admin/tournaments/${cup.id}`));
  const match = detail.teamMatches.find(row => row.rosterAId === roster.id || row.rosterBId === roster.id);
  const renamedSide = match.rosterAId === roster.id ? match.rosterA : match.rosterB;
  assert.equal(renamedSide.name, `Live ${leader.name}`);
});

test("invalid or duplicate names fail without changes, and historical rosters remain read-only", async () => {
  for (const name of ["", "  ", "x", "x".repeat(81)]) await expect(rename(players[0], name), 400);
  await expect(rename(leader, `  ${otherRoster.name.toUpperCase()}  `), 409);
  assert.equal((await profile()).roster.name, roster.name);
  assert.equal((await expect(rename(leader, "  Новый   ростер  "))).roster.name, "Новый ростер");
  assert.equal((await expect(rename(leader, "я".repeat(80)))).roster.name.length, 80);
  await expect(leader.http.patch(`/api/tournaments/${cup.id}/rosters/999999`, { name: "Missing" }), 404);
  for (const status of ["completed", "cancelled"]) {
    await getPool().query("UPDATE tournaments SET status = $2 WHERE id = $1", [cup.id, status]);
    assert.equal((await profile(admin)).viewer.canRename, false);
    await expect(rename(leader, "Frozen"), 409);
  }
  await getPool().query("UPDATE tournaments SET status = 'registration_open' WHERE id = $1", [cup.id]);
  for (const status of ["withdrawn", "finished"]) {
    await getPool().query("UPDATE tournament_team_rosters SET status = $2 WHERE id = $1", [roster.id, status]);
    assert.equal((await profile(leader)).viewer.canRename, false);
    await expect(rename(leader, "Frozen"), 409);
  }
});
