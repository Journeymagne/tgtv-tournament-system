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
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
let server, admin;
const authLimiter = createRateLimiter({ max: 1000, windowMs: 60000 });

test.before(async () => {
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await getPool().query("TRUNCATE tournaments, player_teams, users RESTART IDENTITY CASCADE");
  authLimiter.reset();
  admin = await register("Admin");
});

async function register(name) {
  const http = createClient(server.baseUrl);
  const result = await http.post("/api/register", { name, password: "password123", confirmPassword: "password123", telegramContact: `@${name}` });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { ...result.body.user, http };
}

async function tournament(overrides = {}) {
  const result = await admin.http.post("/api/admin/tournaments", {
    name: "September Cup", startsAt: "2026-09-18T10:00:00.000Z", format: "swiss", swissRoundCount: 6, ...overrides
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const saved = result.body.tournament;
  assert.equal((await admin.http.post(`/api/admin/tournaments/${saved.id}/publish`)).status, 200);
  return saved;
}

test("tournament logos persist on creation, lists, details and updates, and can be removed", async () => {
  const cup = await tournament({ logoData: PNG });
  const guest = createClient(server.baseUrl);
  assert.equal(cup.logoData, PNG);
  assert.equal((await guest.get(`/api/tournaments/${cup.slug}`)).body.tournament.logoData, PNG);
  assert.equal((await guest.get("/api/tournaments")).body.tournaments[0].logoData, PNG);
  const regular = await register("Regular");
  assert.equal((await regular.http.patch(`/api/admin/tournaments/${cup.id}`, { logoData: null })).status, 403);
  for (const logoData of ["https://example.com/logo.png", "data:image/svg+xml;base64,YQ==", `data:image/png;base64,${Buffer.alloc(1024 * 1024 + 1).toString("base64")}`]) {
    assert.equal((await admin.http.patch(`/api/admin/tournaments/${cup.id}`, { logoData })).status, 400);
  }
  assert.equal((await admin.http.patch(`/api/admin/tournaments/${cup.id}`, { description: "Changed" })).body.tournament.logoData, PNG);
  assert.equal((await admin.http.patch(`/api/admin/tournaments/${cup.id}`, { logoData: null })).body.tournament.logoData, null);
  assert.equal((await guest.get(`/api/tournaments/${cup.slug}`)).body.tournament.logoData, null);
  const rulesLink = `data:application/pdf;base64,${Buffer.alloc(2 * 1024 * 1024, 65).toString("base64")}`;
  const logoData = `data:image/png;base64,${Buffer.alloc(1024 * 1024, 65).toString("base64")}`;
  const updated = await admin.http.patch(`/api/admin/tournaments/${cup.id}`, { logoData, rulesLink });
  assert.equal(updated.status, 200);
  const reopened = (await admin.http.get(`/api/admin/tournaments/${cup.id}`)).body.tournament;
  assert.equal(reopened.logoData, logoData);
  // The PDF is no longer inlined anywhere: JSON carries a URL and a type.
  assert.equal(reopened.rulesLinkType, "pdf");
  assert.match(reopened.rulesLink, /^\/api\/tournaments\/[^/]+\/rules\?v=[0-9a-f]{16}$/);
  assert.ok(reopened.rulesLink.startsWith(`/api/tournaments/${cup.slug}/rules?v=`));
  assert.doesNotMatch(JSON.stringify(reopened), /data:application\/pdf/);
});

test("individual factions and faction rules remain private until registration closes, including after reopening", async () => {
  const cup = await tournament();
  const alpha = await register("Alpha");
  const beta = await register("Beta");
  const outsider = await register("Outsider");
  for (const [player, faction] of [[alpha, "Angels of Death"], [beta, "Kommandos"]]) {
    assert.equal((await player.http.post(`/api/tournaments/${cup.id}/join`, { faction })).status, 200);
  }
  await getPool().query("UPDATE tournament_participants SET faction_rules = 'Private faction notes' WHERE tournament_id = $1", [cup.id]);
  const guest = createClient(server.baseUrl);
  for (const http of [guest, outsider.http]) {
    const data = (await http.get(`/api/tournaments/${cup.slug}`)).body;
    assert.ok(data.participants.every((p) => p.factionHidden && !p.faction && !p.factionRules));
    assert.doesNotMatch(JSON.stringify(data), /Angels of Death|Kommandos|Private faction notes/);
  }
  const own = (await alpha.http.get(`/api/tournaments/${cup.slug}`)).body.participants;
  assert.equal(own.find((p) => p.userId === alpha.id).faction, "Angels of Death");
  assert.equal(own.find((p) => p.userId === beta.id).faction, "");
  assert.ok((await admin.http.get(`/api/tournaments/${cup.slug}`)).body.participants.every((p) => p.faction));
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`)).status, 200);
  assert.ok((await guest.get(`/api/tournaments/${cup.slug}`)).body.participants.every((p) => p.faction && !p.factionHidden));
  await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/reopen`);
  assert.ok((await guest.get(`/api/tournaments/${cup.slug}`)).body.participants.every((p) => p.factionHidden));
});

test("rosters receive per-team tournament defaults or custom names and hide factions on tournament and team pages", async () => {
  const cup = await tournament({ participantMode: "team", teamSize: 3 });
  const leader = await register("Leader");
  const people = [];
  for (let i = 1; i <= 9; i += 1) people.push(await register(`Player${i}`));
  const team = (await leader.http.post("/api/teams", { name: "Amber Guard" })).body.team;
  for (const person of people) {
    const invitation = await leader.http.post(`/api/teams/${team.id}/invitations`, { userId: person.id });
    assert.equal((await person.http.post(`/api/team-invitations/${invitation.body.invitation.id}/accept`)).status, 200);
  }
  const rosters = [];
  for (let index = 0; index < 3; index += 1) {
    const members = people.slice(index * 3, index * 3 + 3);
    const response = await members[0].http.post(`/api/tournaments/${cup.id}/rosters`, {
      teamId: team.id, captainUserId: members[0].id,
      ...(index === 2 ? { name: "  Custom   Squad  " } : {}),
      members: members.map((p) => ({ userId: p.id, faction: "Kommandos" }))
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    rosters.push(response.body.roster);
  }
  assert.deepEqual(rosters.map((r) => r.name), ["Amber Guard 1", "Amber Guard 2", "Custom Squad"]);
  const mine = (await people[0].http.get(`/api/tournaments/${cup.slug}`)).body;
  assert.equal(mine.viewerTeams[0].defaultRosterName, "Amber Guard 4");
  assert.ok(mine.rosters[0].members.every((m) => m.factionSnapshot));
  assert.ok(mine.rosters.slice(1).every((r) => r.members.every((m) => m.factionHidden)));
  const memberView = (await people[1].http.get(`/api/tournaments/${cup.slug}`)).body;
  assert.equal(memberView.rosters[0].members.find((m) => m.userId === people[1].id).factionSnapshot, "Kommandos");
  assert.ok(memberView.rosters[0].members.filter((m) => m.userId !== people[1].id).every((m) => m.factionHidden));
  const guest = createClient(server.baseUrl);
  for (const url of [`/api/tournaments/${cup.slug}`, `/api/teams/${team.slug}`]) {
    const hidden = (await guest.get(url)).body;
    assert.doesNotMatch(JSON.stringify(hidden), /Kommandos/);
    assert.ok(hidden.rosters.every((r) => r.members.every((m) => m.factionHidden)));
    for (const http of [leader.http, admin.http]) {
      assert.ok((await http.get(url)).body.rosters.every((r) => r.members.every((m) => m.factionSnapshot)));
    }
  }
  const nextCup = await tournament({ name: "Another Cup", participantMode: "team", teamSize: 3 });
  const fresh = (await people[0].http.get(`/api/tournaments/${nextCup.slug}`)).body;
  assert.equal(fresh.viewerTeams[0].defaultRosterName, "Amber Guard 1");
  await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`);
  for (const url of [`/api/tournaments/${cup.slug}`, `/api/teams/${team.slug}`]) {
    assert.ok((await guest.get(url)).body.rosters.every((r) => r.members.every((m) => m.factionSnapshot && !m.factionHidden)));
  }
});

test("deleting a roster frees its name and its players so the team can register again", async () => {
  const cup = await tournament({ participantMode: "team", teamSize: 3 });
  const leader = await register("Leader");
  const people = [];
  for (let i = 1; i <= 3; i += 1) people.push(await register(`Player${i}`));
  const team = (await leader.http.post("/api/teams", { name: "Amber Guard" })).body.team;
  for (const person of people) {
    const invitation = await leader.http.post(`/api/teams/${team.id}/invitations`, { userId: person.id });
    assert.equal((await person.http.post(`/api/team-invitations/${invitation.body.invitation.id}/accept`)).status, 200);
  }
  const registerRoster = () => people[0].http.post(`/api/tournaments/${cup.id}/rosters`, {
    teamId: team.id, captainUserId: people[0].id, name: "Amber Guard 1",
    members: people.map((person) => ({ userId: person.id, faction: "Kommandos" }))
  });

  const first = await registerRoster();
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const rosterId = first.body.roster.id;

  // Withdrawing releases the name but still holds the players, which is exactly
  // the state a permanent delete has to be able to clear.
  assert.equal((await people[0].http.post(`/api/tournaments/${cup.id}/rosters/${rosterId}/withdraw`)).status, 200);
  const blocked = await registerRoster();
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));

  const outsider = await register("Outsider");
  assert.equal((await outsider.http.del(`/api/tournaments/${cup.id}/rosters/${rosterId}`)).status, 403);
  assert.equal((await createClient(server.baseUrl).del(`/api/tournaments/${cup.id}/rosters/${rosterId}`)).status, 401);

  assert.equal((await people[0].http.del(`/api/tournaments/${cup.id}/rosters/${rosterId}`)).status, 200);
  assert.equal((await people[0].http.del(`/api/tournaments/${cup.id}/rosters/${rosterId}`)).status, 404);
  assert.deepEqual((await people[0].http.get(`/api/tournaments/${cup.slug}`)).body.rosters, []);
  const members = await getPool().query("SELECT id FROM tournament_team_roster_members WHERE roster_id = $1", [rosterId]);
  assert.equal(members.rowCount, 0);

  const again = await registerRoster();
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.equal(again.body.roster.name, "Amber Guard 1");
  assert.deepEqual(again.body.roster.members.map((member) => member.userId).sort(), people.map((person) => person.id).sort());
});

test("after the start a roster removal forfeits its open matches instead of erasing the roster", async () => {
  const cup = await tournament({ participantMode: "team", teamSize: 3 });
  const teams = [];
  for (let index = 0; index < 4; index += 1) {
    const leader = await register(`Leader${index}`);
    const people = [];
    for (let i = 1; i <= 3; i += 1) people.push(await register(`Team${index}Player${i}`));
    const team = (await leader.http.post("/api/teams", { name: `Squad ${index}` })).body.team;
    for (const person of people) {
      const invitation = await leader.http.post(`/api/teams/${team.id}/invitations`, { userId: person.id });
      assert.equal((await person.http.post(`/api/team-invitations/${invitation.body.invitation.id}/accept`)).status, 200);
    }
    const roster = await people[0].http.post(`/api/tournaments/${cup.id}/rosters`, {
      teamId: team.id, captainUserId: people[0].id,
      members: people.map((person) => ({ userId: person.id, faction: "Kommandos" }))
    });
    assert.equal(roster.status, 201, JSON.stringify(roster.body));
    teams.push({ people, roster: roster.body.roster });
  }
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`)).status, 200);
  const started = await admin.http.post(`/api/admin/tournaments/${cup.id}/start`, {
    tables: [
      { killzone: "Volkus", deployment: 1 },
      { killzone: "Gallowdark", deployment: 2 },
      { killzone: "Octarius", deployment: 3 }
    ]
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));

  // After the start a roster is no longer erased: it is withdrawn and its open
  // matches are forfeited, so already-played results keep their place in history.
  const captain = teams[0].people[0];
  assert.equal((await captain.http.del(`/api/tournaments/${cup.id}/rosters/${teams[0].roster.id}`)).status, 403);
  const removed = await admin.http.del(`/api/tournaments/${cup.id}/rosters/${teams[0].roster.id}`);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.resultsPreserved, true);
  const kept = await getPool().query(
    "SELECT status FROM tournament_team_rosters WHERE id = $1",
    [teams[0].roster.id]
  );
  assert.equal(kept.rows[0].status, "withdrawn");
});

test("the tournament rules PDF is served as a cacheable file instead of riding inside every JSON response", async () => {
  const pdfBytes = Buffer.alloc(64 * 1024, 68);
  const rulesLink = `data:application/pdf;base64,${pdfBytes.toString("base64")}`;
  const cup = await tournament({ rulesLink });
  const alpha = await register("Alpha");
  const beta = await register("Beta");
  for (const player of [alpha, beta]) {
    assert.equal((await player.http.post(`/api/tournaments/${cup.id}/join`, { faction: "Kommandos" })).status, 200);
  }

  const guest = createClient(server.baseUrl);
  const page = (await guest.get(`/api/tournaments/${cup.slug}`)).body;
  assert.equal(page.tournament.rulesLinkType, "pdf");
  const url = page.tournament.rulesLink;
  assert.match(url, /^\/api\/tournaments\/[^/]+\/rules\?v=[0-9a-f]{16}$/);
  // The whole point: no response that merely mentions the tournament may carry
  // the file. That includes the games list, where it used to repeat per match.
  assert.doesNotMatch(JSON.stringify(page), /data:application\/pdf/);
  assert.doesNotMatch(JSON.stringify((await alpha.http.get("/api/games")).body), /data:application\/pdf/);
  assert.doesNotMatch(JSON.stringify((await guest.get("/api/tournaments")).body), /data:application\/pdf/);

  const file = await fetch(`${server.baseUrl}${url}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.equal(file.headers.get("cache-control"), "public, max-age=604800, immutable");
  assert.match(file.headers.get("content-disposition"), /^attachment; filename="/);
  assert.ok(Buffer.from(await file.arrayBuffer()).equals(pdfBytes));

  const etag = file.headers.get("etag");
  assert.ok(etag);
  const revalidated = await fetch(`${server.baseUrl}${url}`, { headers: { "if-none-match": etag } });
  assert.equal(revalidated.status, 304);
  assert.equal((await revalidated.text()).length, 0);

  // Replacing the file changes the version in the URL, so a cached copy of the
  // old one can never be served for the new tournament rules.
  const replaced = Buffer.alloc(1024, 69);
  await admin.http.patch(`/api/admin/tournaments/${cup.id}`, {
    rulesLink: `data:application/pdf;base64,${replaced.toString("base64")}`
  });
  const nextUrl = (await guest.get(`/api/tournaments/${cup.slug}`)).body.tournament.rulesLink;
  assert.notEqual(nextUrl, url);
  assert.ok(Buffer.from(await (await fetch(`${server.baseUrl}${nextUrl}`)).arrayBuffer()).equals(replaced));

  const noFile = await tournament({ name: "No Rules Cup" });
  assert.equal((await guest.get(`/api/tournaments/${noFile.slug}`)).body.tournament.rulesLinkType, "");
  assert.equal((await fetch(`${server.baseUrl}/api/tournaments/${noFile.slug}/rules`)).status, 404);
});

test("an external rules URL is passed through untouched", async () => {
  const cup = await tournament({ rulesLink: "https://example.com/rules.pdf" });
  const guest = createClient(server.baseUrl);
  const shown = (await guest.get(`/api/tournaments/${cup.slug}`)).body.tournament;
  assert.equal(shown.rulesLink, "https://example.com/rules.pdf");
  assert.equal(shown.rulesLinkType, "url");
  assert.equal((await fetch(`${server.baseUrl}/api/tournaments/${cup.slug}/rules`)).status, 404);
});
