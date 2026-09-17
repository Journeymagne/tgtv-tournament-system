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
let server, admin;
const authLimiter = createRateLimiter({ max: 1000, windowMs: 60000 });

test.before(async () => {
  const url = new URL(TEST_DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.includes("test"));
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await getPool().query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  authLimiter.reset();
  admin = await register("Admin");
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
async function cup(overrides = {}) {
  const { tournament } = await expect(admin.http.post("/api/admin/tournaments", {
    name: "Registration Cup", format: "swiss", swissRoundCount: 3, startsAt: "2026-09-18T10:00:00Z", ...overrides
  }), 201);
  await expect(admin.http.post(`/api/admin/tournaments/${tournament.id}/publish`));
  return tournament;
}
const base = (tournament) => `/api/admin/tournaments/${tournament.id}`;
const join = (player, tournament) => player.http.post(`/api/tournaments/${tournament.id}/join`, { faction: "Kommandos" });

test("optional registration limits are validated, published and editable without changing other settings", async () => {
  for (const registrationLimit of [0, -1, 2.5, "12", true, 2147483648]) {
    await expect(admin.http.post("/api/admin/tournaments", { format: "swiss", swissRoundCount: 3, registrationLimit }), 400);
  }
  await expect(admin.http.post("/api/admin/tournaments", { participantMode: "team", format: "swiss", swissRoundCount: 3, registrationLimit: 129 }), 400);
  await expect(admin.http.post("/api/admin/tournaments", { format: "single_elimination", singleEliminationSize: 8, registrationLimit: 9 }), 400);
  const tournament = await cup({ registrationLimit: 12 });
  const guest = createClient(server.baseUrl);
  assert.equal((await expect(guest.get("/api/tournaments"))).tournaments[0].registrationLimit, 12);
  assert.equal((await expect(guest.get(`/api/tournaments/${tournament.slug}`))).tournament.registrationLimit, 12);
  await expect(admin.http.patch(base(tournament), { description: "Rules" }));
  assert.equal((await expect(admin.http.get(base(tournament)))).tournament.registrationLimit, 12);
  assert.equal((await expect(admin.http.patch(base(tournament), { registrationLimit: null }))).tournament.registrationLimit, null);
  assert.equal((await cup()).registrationLimit, null);
});

test("the last individual place cannot be claimed twice; withdrawal frees it; admin and bulk additions respect the limit", async () => {
  const tournament = await cup({ registrationLimit: 2 });
  const players = await Promise.all(["Alpha", "Beta", "Gamma"].map(register));
  const responses = await Promise.all(players.map((player) => join(player, tournament)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200, 409]);
  await expect(admin.http.post(`${base(tournament)}/participants`, { displayName: "Extra" }), 409);
  await expect(admin.http.patch(base(tournament), { registrationLimit: 1 }), 409);
  const winner = players[responses.findIndex((response) => response.status === 200)];
  const waiting = players[responses.findIndex((response) => response.status === 409)];
  await expect(winner.http.post(`/api/tournaments/${tournament.id}/withdraw`));
  await expect(join(waiting, tournament));
  await expect(admin.http.patch(base(tournament), { registrationLimit: 3 }));
  await expect(admin.http.post(`${base(tournament)}/participants/bulk`, { names: "Guest A\nGuest B" }), 409);
  const data = await expect(admin.http.get(base(tournament)));
  assert.equal(data.participants.filter((entry) => !["withdrawn", "removed"].includes(entry.status)).length, 2);
});

test("participant payments are admin-only, persist after completion and leave prepared rounds intact", async () => {
  const tournament = await cup({ registrationLimit: 4 });
  await expect(admin.http.post(`${base(tournament)}/participants/bulk`, { names: "One\nTwo\nThree\nFour" }), 201);
  await expect(admin.http.post(`${base(tournament)}/registration/close`));
  const prepared = await expect(admin.http.post(`${base(tournament)}/rounds/next`));
  const entry = prepared.participants[0];
  assert.equal(entry.paid, false);
  const path = `${base(tournament)}/participants/${entry.id}/payment`;
  const player = await register("Spectator");
  const guest = createClient(server.baseUrl);
  await expect(guest.patch(path, { paid: true }), 401);
  await expect(player.http.patch(path, { paid: true }), 403);
  await expect(admin.http.patch(path, { paid: "true" }), 400);
  await expect(admin.http.patch(path, { paid: true }));
  const data = await expect(admin.http.get(base(tournament)));
  assert.equal(data.participants[0].paid, true);
  assert.deepEqual(data.rounds, prepared.rounds.map((round) => ({ ...round, matches: round.matches.map((match) => ({
    ...match,
    participantA: match.participantA?.id === entry.id ? { ...match.participantA, paid: true } : match.participantA,
    participantB: match.participantB?.id === entry.id ? { ...match.participantB, paid: true } : match.participantB
  })) })));
  assert.doesNotMatch(JSON.stringify(await expect(guest.get(`/api/tournaments/${tournament.slug}`))), /"paid"/);
  const other = await cup();
  await expect(admin.http.patch(`${base(other)}/participants/${entry.id}/payment`, { paid: false }), 404);
  await getPool().query("UPDATE tournaments SET status='completed' WHERE id=$1", [tournament.id]);
  await expect(admin.http.patch(path, { paid: false }));
  assert.equal((await expect(admin.http.get(base(tournament)))).participants[0].paid, false);
  assert.equal((await getPool().query("SELECT COUNT(*)::int AS n FROM tournament_audit_events WHERE event_type='registration_payment_update'")).rows[0].n, 2);
});

async function team(name) {
  const people = [];
  for (let index = 0; index < 3; index++) people.push(await register(`${name}${index}`));
  const { team } = await expect(people[0].http.post("/api/teams", { name }), 201);
  for (const person of people.slice(1)) {
    const { invitation } = await expect(people[0].http.post(`/api/teams/${team.id}/invitations`, { userId: person.id }), 201);
    await expect(person.http.post(`/api/team-invitations/${invitation.id}/accept`));
  }
  return { ...team, people, body: { teamId: team.id, captainUserId: people[0].id, members: people.map((person) => ({ userId: person.id, faction: "Kommandos" })) } };
}

test("team limits count rosters, serialize competing registrations and allow freed places to be used", async () => {
  const tournament = await cup({ participantMode: "team", registrationLimit: 1 });
  const teams = [await team("Amber"), await team("Blue")];
  const path = `/api/tournaments/${tournament.id}/rosters`;
  const responses = await Promise.all(teams.map((team) => team.people[0].http.post(path, team.body)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const index = responses.findIndex((response) => response.status === 201);
  const roster = responses[index].body.roster;
  const other = teams[1 - index];
  await expect(admin.http.post(path, other.body), 409);
  await expect(teams[index].people[0].http.post(`${path}/${roster.id}/withdraw`));
  await expect(other.people[0].http.post(path, other.body), 201);
  assert.equal((await expect(admin.http.get(base(tournament)))).rosters.filter((roster) => roster.status !== "withdrawn").length, 1);
});

test("roster payment persists, is admin-only and is private on tournament, roster and team pages", async () => {
  const tournament = await cup({ participantMode: "team", registrationLimit: 4 });
  const squad = await team("Silver");
  const { roster } = await expect(squad.people[0].http.post(`/api/tournaments/${tournament.id}/rosters`, squad.body), 201);
  const path = `${base(tournament)}/rosters/${roster.id}/payment`;
  await expect(squad.people[0].http.patch(path, { paid: true }), 403);
  await expect(admin.http.patch(path, { paid: 1 }), 400);
  await expect(admin.http.patch(path, { paid: true }));
  assert.equal((await expect(admin.http.get(base(tournament)))).rosters[0].paid, true);
  const guest = createClient(server.baseUrl);
  for (const http of [guest, squad.people[0].http]) {
    for (const url of [`/api/tournaments/${tournament.slug}`, `/api/rosters/${roster.id}`, `/api/teams/${squad.slug}`]) {
      assert.doesNotMatch(JSON.stringify(await expect(http.get(url))), /"paid"/);
    }
  }
  const other = await cup({ participantMode: "team" });
  await expect(admin.http.patch(`${base(other)}/rosters/${roster.id}/payment`, { paid: false }), 404);
  await getPool().query("UPDATE tournaments SET status='completed' WHERE id=$1", [tournament.id]);
  await expect(admin.http.patch(path, { paid: false }));
  assert.equal((await expect(admin.http.get(base(tournament)))).rosters[0].paid, false);
  assert.equal((await getPool().query("SELECT COUNT(*)::int AS n FROM player_team_audit_events WHERE event_type='registration_payment_update'")).rows[0].n, 2);
  await require("../../src/db/migrations/028_tournament_registration").up(getPool());
  assert.equal((await expect(admin.http.get(base(tournament)))).rosters[0].paid, false);
});
