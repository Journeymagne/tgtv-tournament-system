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

test("individual factions and faction rules remain private until the first round starts", async () => {
  const cup = await tournament();
  const alpha = await register("Alpha");
  const beta = await register("Beta");
  const gamma = await register("Gamma");
  const delta = await register("Delta");
  const outsider = await register("Outsider");
  for (const [player, faction] of [[alpha, "Angels of Death"], [beta, "Kommandos"], [gamma, "Kommandos"], [delta, "Kommandos"]]) {
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
  assert.ok((await guest.get(`/api/tournaments/${cup.slug}`)).body.participants.every((p) => p.factionHidden));
  await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/reopen`);
  assert.ok((await guest.get(`/api/tournaments/${cup.slug}`)).body.participants.every((p) => p.factionHidden));
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`)).status, 200);
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/start`)).status, 409);
  const started = await admin.http.post(`/api/admin/tournaments/${cup.id}/rounds/next`);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.rounds.length, 1);
  assert.equal(started.body.rounds[0].status, "not_ready");
  assert.equal(started.body.tournament.status, "registration_closed");
  assert.equal((await alpha.http.get("/api/notifications")).body.items.length, 0);
  assert.equal((await getPool().query("SELECT count(*)::int AS n FROM games")).rows[0].n, 0);
  const match = started.body.rounds[0].matches.find((item) => item.participantA.userId === alpha.id || item.participantB.userId === alpha.id);
  assert.equal((await alpha.http.post(`/api/tournaments/${cup.id}/matches/${match.id}/result`, {})).status, 409);
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/matches/${match.id}/result`, {})).status, 409);
  assert.equal((await admin.http.get(`/api/admin/tournaments/${cup.id}/rounds/next/preview`)).status, 200);
  for (const http of [guest, outsider.http]) {
    const hidden = (await http.get(`/api/tournaments/${cup.slug}`)).body;
    assert.ok(hidden.participants.every((p) => p.factionHidden));
    assert.doesNotMatch(JSON.stringify(hidden), /Angels of Death|Kommandos|Private faction notes/);
  }
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/start`)).status, 200);
  assert.equal((await alpha.http.get("/api/notifications")).body.items.filter((item) => item.type === "tournament_started").length, 1);
  assert.equal((await outsider.http.get("/api/notifications")).body.items.length, 0);
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/start`)).status, 409);
  for (const http of [guest, outsider.http]) {
    const revealed = (await http.get(`/api/tournaments/${cup.slug}`)).body;
    assert.equal(revealed.rounds[0].status, "active");
    assert.ok(revealed.participants.every((p) => p.faction && p.factionRules && !p.factionHidden));
  }
});

test("prepared first round can be edited safely and is invalidated when registration or participants change", async () => {
  const cup = await tournament();
  for (const name of ["Alpha", "Beta", "Gamma", "Delta"]) {
    const player = await register(name);
    assert.equal((await player.http.post(`/api/tournaments/${cup.id}/join`, { faction: "Kommandos" })).status, 200);
  }
  const base = `/api/admin/tournaments/${cup.id}`;
  await admin.http.post(`${base}/registration/close`);
  const prepared = await admin.http.post(`${base}/rounds/next`);
  assert.equal(prepared.status, 200);
  const ids = prepared.body.participants.map((participant) => participant.id);
  const matchups = [
    { participantAId: ids[0], participantBId: ids[1] },
    { participantAId: ids[2], participantBId: ids[3] }
  ];
  const edited = await admin.http.post(`${base}/rounds/next`, { matchups, mission: { critOp: "Loot" } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.rounds.length, 1);
  assert.notEqual(edited.body.rounds[0].id, prepared.body.rounds[0].id);
  const preview = await admin.http.get(`${base}/rounds/next/preview`);
  assert.equal(preview.body.prepared, true);
  assert.equal(preview.body.round.mission.critOp, "Loot");
  assert.deepEqual(preview.body.round.matches.map(({ participantAId, participantBId }) => ({ participantAId, participantBId })), matchups);
  const invalid = await admin.http.post(`${base}/rounds/next`, { matchups: [matchups[0], matchups[0]] });
  assert.equal(invalid.status, 400);
  assert.equal((await admin.http.get(base)).body.rounds[0].id, edited.body.rounds[0].id, "failed edits keep the saved round");
  await admin.http.post(`${base}/registration/reopen`);
  assert.equal((await admin.http.get(base)).body.rounds.length, 0);
  await admin.http.post(`${base}/registration/close`);
  assert.equal((await admin.http.post(`${base}/start`)).status, 409);
  assert.equal((await admin.http.post(`${base}/rounds/next`)).status, 200);
  const changed = await admin.http.patch(`${base}/participants/${ids[0]}`, { faction: "Angels of Death" });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal((await admin.http.get(base)).body.rounds.length, 0);
  const finalPreparation = await admin.http.post(`${base}/rounds/next`, { matchups, mission: { critOp: "Loot" } });
  const started = await admin.http.post(`${base}/start`);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.deepEqual(started.body.rounds[0].matches.map((match) => match.id), finalPreparation.body.rounds[0].matches.map((match) => match.id));
  assert.deepEqual(started.body.rounds[0].matches.map(({ participantAId, participantBId }) => ({ participantAId, participantBId })), matchups);
  assert.ok(started.body.rounds[0].matches.every((match) => match.mission.critOp === "Loot" && match.gameId));
});

test("rosters receive per-team tournament defaults or custom names and hide factions on tournament and team pages", async () => {
  const cup = await tournament({ participantMode: "team", teamSize: 3 });
  const leader = await register("Leader");
  const people = [];
  for (let i = 1; i <= 12; i += 1) people.push(await register(`Player${i}`));
  const team = (await leader.http.post("/api/teams", { name: "Amber Guard" })).body.team;
  for (const person of people) {
    const invitation = await leader.http.post(`/api/teams/${team.id}/invitations`, { userId: person.id });
    assert.equal((await person.http.post(`/api/team-invitations/${invitation.body.invitation.id}/accept`)).status, 200);
  }
  const rosters = [];
  for (let index = 0; index < 4; index += 1) {
    const members = people.slice(index * 3, index * 3 + 3);
    const response = await members[0].http.post(`/api/tournaments/${cup.id}/rosters`, {
      teamId: team.id, captainUserId: members[0].id,
      ...(index === 2 ? { name: "  Custom   Squad  " } : {}),
      members: members.map((p) => ({ userId: p.id, faction: "Kommandos" }))
    });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    rosters.push(response.body.roster);
  }
  assert.deepEqual(rosters.map((r) => r.name), ["Amber Guard 1", "Amber Guard 2", "Custom Squad", "Amber Guard 4"]);
  const rosterGuest = createClient(server.baseUrl);
  assert.equal((await rosterGuest.get("/api/rosters/999999")).status, 404);
  assert.equal((await rosterGuest.get("/api/rosters/invalid")).status, 404);
  const ownProfile = (await people[1].http.get(`/api/rosters/${rosters[0].id}`)).body;
  assert.equal(ownProfile.roster.id, rosters[0].id);
  assert.ok(ownProfile.roster.members.every((member) => member.factionSnapshot === "Kommandos"));
  assert.deepEqual(ownProfile.teamMatches, []);
  for (const http of [leader.http, admin.http]) {
    assert.ok((await http.get(`/api/rosters/${rosters[0].id}`)).body.roster.members.every((member) => member.factionSnapshot));
  }
  const otherProfile = (await people[1].http.get(`/api/rosters/${rosters[1].id}`)).body;
  assert.doesNotMatch(JSON.stringify(otherProfile), /Kommandos/);
  const mine = (await people[0].http.get(`/api/tournaments/${cup.slug}`)).body;
  assert.equal(mine.viewerTeams[0].defaultRosterName, "Amber Guard 5");
  assert.ok(mine.rosters[0].members.every((m) => m.factionSnapshot));
  assert.ok(mine.rosters.slice(1).every((r) => r.members.every((m) => m.factionHidden)));
  async function assertMemberView() {
    for (const url of [`/api/tournaments/${cup.slug}`, `/api/teams/${team.slug}`]) {
      const memberView = (await people[1].http.get(url)).body;
      const ownRoster = memberView.rosters.find((r) => r.id === rosters[0].id);
      assert.equal(ownRoster.members.length, 3);
      assert.ok(ownRoster.members.every((m) => m.factionSnapshot === "Kommandos" && !m.factionHidden));
      const otherRosters = memberView.rosters.filter((r) => r.tournamentId === cup.id && r.id !== ownRoster.id);
      assert.equal(otherRosters.length, 3);
      assert.ok(otherRosters.every((r) => r.members.every((m) => m.factionHidden && !m.factionSnapshot)));
    }
  }
  await assertMemberView();
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
  const nextRoster = await people[0].http.post(`/api/tournaments/${nextCup.id}/rosters`, {
    teamId: team.id, captainUserId: people[0].id,
    members: people.slice(0, 3).map((person) => ({ userId: person.id, faction: "Kommandos" }))
  });
  assert.equal(nextRoster.status, 201, JSON.stringify(nextRoster.body));
  const outsider = await register("Outsider");
  async function assertHidden() {
    for (const http of [guest, outsider.http]) {
      for (const roster of rosters) {
        const profile = await http.get(`/api/rosters/${roster.id}`);
        assert.equal(profile.status, 200);
        assert.doesNotMatch(JSON.stringify(profile.body), /Kommandos|pairingHistory/);
        assert.ok(profile.body.roster.members.every((member) => member.factionHidden));
      }
      for (const url of [`/api/tournaments/${cup.slug}`, `/api/teams/${team.slug}`]) {
        const hidden = (await http.get(url)).body;
        assert.ok(hidden.rosters.every((r) => r.members.every((m) => m.factionHidden && !m.factionSnapshot)));
        assert.doesNotMatch(JSON.stringify(hidden), /Kommandos/);
      }
    }
  }
  assert.equal((await admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`)).status, 200);
  await assertHidden();
  const started = await admin.http.post(`/api/admin/tournaments/${cup.id}/rounds/next`, {
    tables: [
      { killzone: "Volkus", deployment: 1 },
      { killzone: "Gallowdark", deployment: 2 },
      { killzone: "Octarius", deployment: 3 }
    ]
  });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.rounds.length, 1);
  assert.equal(started.body.rounds[0].status, "not_ready");
  assert.equal(started.body.tournament.startedAt, null);
  for (const person of people) assert.equal((await person.http.get("/api/notifications")).body.items.length, 0);
  const pendingMatch = started.body.teamMatches[0];
  const pendingCaptain = people.find((person) => person.id === pendingMatch.rosterA.captainUserId);
  for (const http of [guest, outsider.http]) {
    const pairing = await http.get(`/api/team-matches/${pendingMatch.id}`);
    assert.equal(pairing.status, 200);
    assert.doesNotMatch(JSON.stringify(pairing.body), /Kommandos/);
  }
  const ownPairing = (await pendingCaptain.http.get(`/api/team-matches/${pendingMatch.id}`)).body.teamMatch;
  assert.ok(ownPairing.rosterA.members.every((member) => member.factionSnapshot === "Kommandos"));
  assert.ok(ownPairing.rosterB.members.every((member) => member.factionHidden && !member.factionSnapshot));
  assert.equal((await pendingCaptain.http.post(`/api/tournaments/${cup.id}/team-matches/${pendingMatch.id}/roll`, {})).status, 409);
  assert.equal((await admin.http.post(`/api/tournaments/${cup.id}/team-matches/${pendingMatch.id}/roll`, { side: "a" })).status, 409);
  const notificationSnapshot = (await pendingCaptain.http.get("/api/notifications")).body;
  assert.equal((await pendingCaptain.http.post("/api/notifications/read", { through: notificationSnapshot.generatedAt })).status, 200);
  assert.equal((await admin.http.get(`/api/admin/tournaments/${cup.id}/rounds/next/preview`)).status, 200);
  await assertHidden();
  await assertMemberView();
  const round = await admin.http.post(`/api/admin/tournaments/${cup.id}/start`);
  assert.equal(round.status, 200, JSON.stringify(round.body));
  assert.equal(round.body.rounds[0].id, started.body.rounds[0].id);
  assert.equal(round.body.rounds[0].status, "active");
  assert.deepEqual(round.body.teamMatches.map((match) => match.id), started.body.teamMatches.map((match) => match.id));
  assert.equal((await pendingCaptain.http.post(`/api/tournaments/${cup.id}/team-matches/${pendingMatch.id}/roll`, { rollRound: 1 })).status, 200);
  for (const person of people) {
    const notifications = (await person.http.get("/api/notifications")).body;
    const startNotice = notifications.items.filter((item) => item.type === "tournament_started");
    assert.equal(startNotice.length, 1);
    assert.equal(startNotice[0].unread, true);
  }
  assert.equal((await outsider.http.get("/api/notifications")).body.items.length, 0);
  for (const http of [guest, outsider.http]) {
    for (const url of [`/api/tournaments/${cup.slug}`, `/api/teams/${team.slug}`]) {
      const data = (await http.get(url)).body;
      const revealed = data.rosters.filter((r) => r.tournamentId === cup.id);
      assert.equal(revealed.length, 4);
      assert.ok(revealed.every((r) => r.members.every((m) => m.factionSnapshot && !m.factionHidden)));
      assert.ok(data.rosters.filter((r) => r.tournamentId === nextCup.id).every((r) => r.members.every((m) => m.factionHidden)));
    }
  }
  // Two rosters from the same parent team share a match, but not the other
  // roster's match or the same players' participation in another tournament.
  const match = round.body.teamMatches[0];
  const memberA = match.rosterA.members[0];
  const memberB = match.rosterB.members[0];
  const game = await withTransaction(async (client) => {
    const gamesRepo = require("../../src/db/repositories/games");
    const matchesRepo = require("../../src/db/repositories/team-matches");
    const saved = await gamesRepo.insert(client, { sourceType: "team_match_game", sourceId: match.id, playerIds: [memberA.userId, memberB.userId] });
    await matchesRepo.insertGameLink(client, { teamMatchId: match.id, gameId: saved.id, slot: 1, rosterAMemberId: memberA.id, rosterBMemberId: memberB.id, mission: { critOp: "Loot" } });
    await client.query("UPDATE games SET status = 'completed', result = $2::jsonb WHERE id = $1", [saved.id, JSON.stringify({ scores: { [memberA.userId]: { total: 18, tac: 6 }, [memberB.userId]: { total: 10, tac: 3 } } })]);
    await matchesRepo.update(client, match.id, { phase: "completed", teamTournamentPointsA: 2, teamTournamentPointsB: 0, teamGamePointsA: 18, teamGamePointsB: 2 });
    return saved;
  });
  for (const roster of rosters) {
    const profile = (await guest.get(`/api/rosters/${roster.id}`)).body;
    assert.equal(profile.tournament.id, cup.id);
    assert.equal(profile.roster.id, roster.id);
    assert.ok(profile.roster.members.every((member) => member.factionSnapshot === "Kommandos"));
    assert.equal(profile.teamMatches.length, 1);
    const ownMatch = profile.teamMatches[0];
    assert.ok([ownMatch.rosterAId, ownMatch.rosterBId].includes(roster.id));
    assert.doesNotMatch(JSON.stringify(profile), /pairingHistory/);
    const isInCompletedMatch = ownMatch.id === match.id;
    assert.equal(profile.standing.played, isInCompletedMatch ? 1 : 0);
    assert.deepEqual(ownMatch.games.map((link) => link.game.id), isInCompletedMatch ? [game.id] : []);
    if (isInCompletedMatch) {
      assert.equal(profile.standing.totalVp, roster.id === match.rosterAId ? 18 : 10);
      assert.equal(ownMatch.games[0].mission.critOp, "Loot");
    }
  }
  const differentCup = (await guest.get(`/api/rosters/${nextRoster.body.roster.id}`)).body;
  assert.equal(differentCup.tournament.id, nextCup.id);
  assert.deepEqual(differentCup.teamMatches, []);
  assert.doesNotMatch(JSON.stringify(differentCup), /Kommandos/);
  await getPool().query("UPDATE tournament_team_rosters SET status = 'withdrawn' WHERE id = $1", [match.rosterAId]);
  await getPool().query("UPDATE tournament_team_roster_members SET ended_at = NOW() WHERE id = $1", [memberA.id]);
  const withdrawn = (await guest.get(`/api/rosters/${match.rosterAId}`)).body;
  assert.equal(withdrawn.standing.rank, null);
  assert.equal(withdrawn.standing.totalVp, 18);
  assert.ok(withdrawn.roster.members.find((member) => member.id === memberA.id).endedAt);
  assert.equal(withdrawn.teamMatches[0].games[0].game.id, game.id);
  await getPool().query("UPDATE tournaments SET status = 'draft' WHERE id = $1", [nextCup.id]);
  assert.equal((await guest.get(`/api/rosters/${nextRoster.body.roster.id}`)).status, 404);
  assert.equal((await people[0].http.get(`/api/rosters/${nextRoster.body.roster.id}`)).status, 404);
  assert.equal((await admin.http.get(`/api/rosters/${nextRoster.body.roster.id}`)).status, 200);
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
  const prepared = await admin.http.post(`/api/admin/tournaments/${cup.id}/rounds/next`, {
    tables: [
      { killzone: "Volkus", deployment: 1 },
      { killzone: "Gallowdark", deployment: 2 },
      { killzone: "Octarius", deployment: 3 }
    ]
  });
  assert.equal(prepared.status, 200, JSON.stringify(prepared.body));
  const started = await admin.http.post(`/api/admin/tournaments/${cup.id}/start`);
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
