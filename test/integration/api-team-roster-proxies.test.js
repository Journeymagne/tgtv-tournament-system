const test = require("node:test");
const assert = require("node:assert/strict");
const { TEST_DATABASE_URL } = require("../helpers/db");
process.env.DATABASE_URL = TEST_DATABASE_URL;
const { getPool, closePool, withClient, withTransaction } = require("../../src/db/pool");
const { migrate } = require("../../src/db/migrate");
const { createRouter } = require("../../src/http/router");
const { createRateLimiter } = require("../../src/http/rate-limit");
const { loadUserFromRequest } = require("../../src/api/auth");
const gamesRepo = require("../../src/db/repositories/games");
const matchesRepo = require("../../src/db/repositories/team-matches");
const routes = require("../../src/api/routes");
const { startApiServer, createClient } = require("../helpers/client");
let server, admin, leader, teammate, team, tournament;
const authLimiter = createRateLimiter({ max: 1000, windowMs: 60000 });

test.before(async () => {
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await getPool().query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  authLimiter.reset();
  admin = await register("ProxyAdmin");
  await require("../helpers/access").grantOwner(getPool(), admin);
  leader = await register("ProxyLeader");
  teammate = await register("ProxyTeammate");
  ({ team } = await expect(leader.http.post("/api/teams", { name: "Proxy Team" }), 201));
  ({ tournament } = await expect(admin.http.post("/api/admin/tournaments", {
    name: "Proxy Cup", startsAt: "2026-10-03T10:00:00.000Z", format: "swiss", swissRoundCount: 3,
    participantMode: "team", teamSize: 3
  }), 201));
});
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
const members = () => [{ userId: leader.id, faction: "Kommandos" }, { proxy: true, userId: null, faction: "" }, { proxy: true, userId: null, faction: "" }];
const body = () => ({ teamId: team.id, captainUserId: leader.id, members: members() });

test("administrators fill a one-account team with distinct proxies without creating accounts", async () => {
  const count = async () => (await getPool().query("SELECT COUNT(*)::int AS count FROM users")).rows[0].count;
  const before = await count();
  const { roster } = await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rosters`, body()), 201);
  assert.equal(await count(), before);
  const proxies = roster.members.filter(member => member.isProxy);
  assert.equal(proxies.length, 2);
  assert.equal(new Set(proxies.map(member => member.displayNameSnapshot)).size, 2);
  assert.ok(proxies.every(member => member.userId === null && member.user === null && member.factionSnapshot === ""));
  const { roster: unchanged } = await expect(admin.http.patch(`/api/tournaments/${tournament.id}/rosters/${roster.id}`, body()));
  assert.deepEqual(unchanged.members.map(member => member.id), roster.members.map(member => member.id));
  assert.deepEqual(unchanged.members.map(member => member.displayNameSnapshot), roster.members.map(member => member.displayNameSnapshot));
});

test("ordinary registration cannot create proxies or forge their account", async () => {
  await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/publish`));
  await expect(leader.http.post(`/api/tournaments/${tournament.id}/rosters`, body()), 403);
  const malformed = body();
  malformed.members[1].userId = teammate.id;
  await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rosters`, malformed), 400);
  assert.equal((await getPool().query("SELECT COUNT(*)::int AS count FROM tournament_team_rosters")).rows[0].count, 0);
});

test("a proxy can be replaced with a current team member while preserving the other proxy", async () => {
  const { roster } = await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rosters`, body()), 201);
  const { invitation } = await expect(leader.http.post(`/api/teams/${team.id}/invitations`, { userId: teammate.id }), 201);
  await expect(teammate.http.post(`/api/team-invitations/${invitation.id}/accept`));
  const edited = body();
  edited.members[1] = { userId: teammate.id, faction: "Kasrkin" };
  const { roster: updated } = await expect(admin.http.patch(`/api/tournaments/${tournament.id}/rosters/${roster.id}`, edited));
  const active = updated.members.filter(member => !member.endedAt);
  assert.equal(active.length, 3);
  assert.equal(active.find(member => member.slot === 2).userId, teammate.id);
  assert.equal(active.find(member => member.slot === 3).id, roster.members[2].id);
  assert.ok(updated.members.find(member => member.id === roster.members[1].id).endedAt);
  assert.equal(updated.members.find(member => member.id === roster.members[1].id).replacedByUserId, teammate.id);
});

test("an entirely proxy roster has no captain and can fill a reserved place", async () => {
  const { roster: reserve } = await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rosters`, { reserve: true, name: "Empty Roster" }), 201);
  const { roster } = await expect(admin.http.patch(`/api/tournaments/${tournament.id}/rosters/${reserve.id}`, {
    teamId: team.id, captainUserId: null, members: [1, 2, 3].map(() => ({ proxy: true, userId: null, faction: "" }))
  }));
  assert.equal(roster.status, "registered");
  assert.equal(roster.isReserve, false);
  assert.equal(roster.captainUserId, null);
  assert.equal(roster.members.filter(member => member.isProxy).length, 3);
});

test("a completed proxy game keeps its identity and empty faction after replacement by an account", async () => {
  const { roster } = await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rosters`, body()), 201);
  for (let index = 0; index < 3; index++) {
    await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rosters`, {
      teamId: team.id, captainUserId: null, members: [1, 2, 3].map(() => ({ proxy: true, faction: "" }))
    }), 201);
  }
  await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/publish`));
  await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/registration/close`));
  await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/rounds/next`, {
    tables: ["Volkus", "Gallowdark", "Octarius"].map((killzone, index) => ({ killzone, deployment: index + 1 }))
  }));
  const started = await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/start`));
  const match = started.teamMatches.find(item => [item.rosterAId, item.rosterBId].includes(roster.id));
  const original = roster.members.find(member => member.slot === 2);
  const paired = match.rosterAId === roster.id
    ? [original, match.rosterB.members[0]] : [match.rosterA.members[0], original];
  const key = member => -member.id;
  const result = { winnerId: key(paired[0]), scores: {
    [key(paired[0])]: { total: 15 }, [key(paired[1])]: { total: 5 }
  } };
  const game = await withTransaction(async client => {
    const saved = await gamesRepo.insert(client, { sourceType: "team_match_game", sourceId: match.id, playerIds: [],
      participants: paired.map(member => ({ userId: null, resultKey: key(member),
        displayNameSnapshot: member.displayNameSnapshot, factionSnapshot: "", isProxy: true })) });
    await matchesRepo.insertGameLink(client, { teamMatchId: match.id, gameId: saved.id, slot: 1,
      rosterAMemberId: paired[0].id, rosterBMemberId: paired[1].id, mission: {} });
    await matchesRepo.update(client, match.id, { phase: "in_progress" });
    await gamesRepo.saveFinalResult(client, saved.id, { result, elo: null });
    return saved;
  });
  const { invitation } = await expect(leader.http.post(`/api/teams/${team.id}/invitations`, { userId: teammate.id }), 201);
  await expect(teammate.http.post(`/api/team-invitations/${invitation.id}/accept`));
  const edited = body();
  edited.members[1] = { userId: teammate.id, faction: "Kasrkin" };
  await expect(admin.http.patch(`/api/tournaments/${tournament.id}/rosters/${roster.id}`, edited));
  const views = [
    (await expect(admin.http.get(`/api/games/${game.id}`))).game,
    (await expect(admin.http.get(`/api/admin/tournaments/${tournament.id}`))).tournamentGames.find(item => item.id === game.id),
    (await expect(createClient(server.baseUrl).get(`/api/tournaments/${tournament.slug}`))).tournamentGames.find(item => item.id === game.id)
  ];
  for (const view of views) {
    assert.deepEqual(view.result, result);
    assert.equal(view.elo, null);
    const player = view.players.find(item => item.id === key(original));
    assert.equal(player.name, original.displayNameSnapshot);
    assert.equal(player.userId, null);
    assert.equal(player.hasProfile, false);
    assert.equal(player.isProxy, true);
    assert.equal(player.faction, "", "the replacement account's faction must not enter the historical proxy game");
  }
});
