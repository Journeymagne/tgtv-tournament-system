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

let server;
let admin, leader, member, outsider, team;
const authLimiter = createRateLimiter({ max: 1000, windowMs: 60000 });

test.before(async () => {
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, {
    withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter
  }));
});
test.after(async () => { await server?.close(); await closePool(); });

async function register(name) {
  const http = createClient(server.baseUrl);
  const response = await http.post("/api/register", {
    name, password: "password123", confirmPassword: "password123",
    telegramContact: `@${name}`, registerNickname: name
  });
  assert.equal(response.status, 201);
  return { http, ...response.body.user };
}

test.beforeEach(async () => {
  await getPool().query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  authLimiter.reset();
  admin = await register("Admin");
  leader = await register("Leader");
  member = await register("Member");
  outsider = await register("Outsider");
  const response = await leader.http.post("/api/teams", { name: "Amber Guard", description: "Original" });
  assert.equal(response.status, 201);
  team = response.body.team;
  await join(member);
});

async function join(player) {
  const invitation = await leader.http.post(`/api/teams/${team.id}/invitations`, { userId: player.id });
  assert.equal(invitation.status, 201);
  assert.equal((await player.http.post(`/api/team-invitations/${invitation.body.invitation.id}/accept`)).status, 200);
}

test("team administration requires an administrator; leaderboard is public", async () => {
  const guest = createClient(server.baseUrl);
  assert.equal((await guest.get("/api/admin/teams")).status, 401);
  assert.equal((await member.http.get("/api/admin/teams")).status, 403);
  const administration = await admin.http.get("/api/admin/teams");
  assert.equal(administration.status, 200);
  assert.equal(administration.body.teams[0].leaderName, "Leader");
  assert.equal(administration.body.teams[0].memberCount, 2);
  const leaderboard = await guest.get("/api/leaderboards/teams");
  assert.equal(leaderboard.status, 200);
  assert.equal(leaderboard.body.teams[0].rating, 1000);
  assert.equal(leaderboard.body.teams[0].nameKey, undefined);
});

test("leaderboards sort every team by venue with stable ties and include archived teams", async () => {
  await getPool().query(`INSERT INTO player_teams (slug, name, name_key, rating_tts, rating_irl)
    SELECT 'extra-' || n, 'Extra ' || n, 'extra ' || n, 1000, 1000 FROM generate_series(1, 205) n`);
  await getPool().query("UPDATE player_teams SET rating_tts = 1250, rating_irl = 950 WHERE id = $1", [team.id]);
  await getPool().query("UPDATE player_teams SET rating_tts = 1100, rating_irl = 1200, archived_at = NOW() WHERE slug = 'extra-1'");
  const guest = createClient(server.baseUrl);
  for (const venue of ["tts", "irl", "combined", "invalid"]) {
    const response = await guest.get(`/api/leaderboards/teams?venue=${venue}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.teams.length, 206);
    assert.equal(response.body.teams[0].slug, venue === "tts" ? team.slug : "extra-1");
    const amber = response.body.teams.find((row) => row.id === team.id);
    assert.equal(amber.rating, venue === "tts" ? 1250 : venue === "irl" ? 950 : 1200);
    const tied = response.body.teams.filter((row) => row.rating === 1000);
    assert.equal(tied[0].slug, "extra-10");
  }
  const administration = await admin.http.get("/api/admin/teams");
  assert.equal(administration.body.teams.length, 206);
  assert.equal(administration.body.teams.at(-1).slug, "extra-1");
});

test("an administrator outside a team edits all profile fields and removes its logo", async () => {
  for (const player of [member, outsider]) {
    assert.equal((await player.http.patch(`/api/teams/${team.id}`, { name: "Forbidden" })).status, 403);
  }
  const logoData = "data:image/png;base64,YQ==";
  const edited = await admin.http.patch(`/api/teams/${team.id}`, { name: "New Name", description: "Updated description", logoData });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.team.name, "New Name");
  assert.equal(edited.body.team.description, "Updated description");
  assert.equal(edited.body.team.logoData, logoData);
  assert.equal(edited.body.team.slug, team.slug);
  assert.equal((await admin.http.patch(`/api/teams/${team.id}`, { logoData: null })).body.team.logoData, null);
  const profile = await admin.http.get(`/api/teams/${team.slug}`);
  assert.equal(profile.body.team.viewer.canAdmin, true);
  assert.equal(profile.body.team.viewer.isMember, false);
  const audit = await getPool().query("SELECT actor_user_id FROM player_team_audit_events WHERE event_type = 'team_update'");
  assert.equal(audit.rows.length, 2);
  assert.ok(audit.rows.every((row) => row.actor_user_id === admin.id));
});

test("admin leadership transfers demote the real leader even when the admin is a regular member", async () => {
  await join(admin);
  const denied = await member.http.post(`/api/teams/${team.id}/leadership`, { userId: member.id });
  assert.equal(denied.status, 403);
  assert.equal((await admin.http.post(`/api/teams/${team.id}/leadership`, { userId: outsider.id })).status, 400);
  const changed = await admin.http.post(`/api/teams/${team.id}/leadership`, { userId: member.id });
  assert.equal(changed.status, 200);
  const profile = (await admin.http.get(`/api/teams/${team.slug}`)).body;
  assert.equal(profile.team.leaderUserId, member.id);
  assert.deepEqual(profile.currentMembers.filter((row) => row.role === "leader").map((row) => row.userId), [member.id]);
  assert.equal(profile.currentMembers.find((row) => row.userId === leader.id).role, "member");
  assert.equal(profile.currentMembers.find((row) => row.userId === admin.id).role, "member");
  assert.equal((await admin.http.post(`/api/teams/${team.id}/leadership`, { userId: admin.id })).status, 200);
});

test("administrator outside a team can transfer leadership and remove members with history", async () => {
  assert.equal((await admin.http.post(`/api/teams/${team.id}/leadership`, { userId: member.id })).status, 200);
  const before = (await admin.http.get(`/api/teams/${team.slug}`)).body;
  const membership = before.currentMembers.find((row) => row.userId === member.id);
  assert.equal((await outsider.http.post(`/api/teams/${team.id}/members/${membership.id}/remove`)).status, 403);
  assert.equal((await admin.http.post(`/api/teams/${team.id}/members/${membership.id}/remove`)).status, 200);
  const after = (await admin.http.get(`/api/teams/${team.slug}`)).body;
  assert.equal(after.team.leaderUserId, leader.id);
  assert.equal(after.currentMembers.length, 1);
  assert.equal(after.formerMembers[0].endReason, "removed");
  assert.equal(after.formerMembers[0].endedByUserId, admin.id);
  assert.equal((await admin.http.post(`/api/teams/${team.id}/members/${membership.id}/remove`)).status, 404);
  const remaining = after.currentMembers[0];
  assert.equal((await admin.http.post(`/api/teams/${team.id}/members/${remaining.id}/remove`)).status, 200);
  const empty = (await admin.http.get(`/api/teams/${team.slug}`)).body;
  assert.equal(empty.team.leaderUserId, null);
  assert.ok(empty.team.archivedAt);
});

test("archived team information can be edited by administrators and restored", async () => {
  assert.equal((await admin.http.post(`/api/teams/${team.id}/archive`)).status, 200);
  assert.equal((await leader.http.patch(`/api/teams/${team.id}`, { name: "Rejected" })).status, 409);
  assert.equal((await admin.http.patch(`/api/teams/${team.id}`, { name: "Archived name" })).status, 200);
  assert.equal((await member.http.post(`/api/admin/teams/${team.id}/restore`)).status, 403);
  assert.equal((await admin.http.post(`/api/admin/teams/${team.id}/restore`)).status, 200);
  assert.equal((await admin.http.get(`/api/teams/${team.slug}`)).body.team.archivedAt, null);
});

test("invalid and duplicate edits leave team data intact", async () => {
  assert.equal((await admin.http.patch(`/api/teams/${team.id}`, { name: "Valid name", logoData: "javascript:bad" })).status, 400);
  const other = await admin.http.post("/api/teams", { name: "Other Team" });
  assert.equal(other.status, 201);
  assert.equal((await admin.http.patch(`/api/teams/${team.id}`, { name: "other team", description: "Rejected" })).status, 409);
  const unchanged = (await admin.http.get(`/api/teams/${team.slug}`)).body.team;
  assert.equal(unchanged.name, "Amber Guard");
  assert.equal(unchanged.description, "Original");
});

test("only a leader or administrator can delete a team, including an archived team", async () => {
  const guest = createClient(server.baseUrl);
  assert.equal((await guest.del(`/api/teams/${team.id}`)).status, 401);
  for (const player of [member, outsider]) {
    assert.equal((await player.http.del(`/api/teams/${team.id}`)).status, 403);
    assert.equal((await player.http.get(`/api/teams/${team.slug}`)).body.team.viewer.canDelete, false);
  }
  for (const id of ["invalid", "0", "-1", "999999"]) {
    assert.equal((await admin.http.del(`/api/teams/${id}`)).status, 404);
  }
  assert.equal((await leader.http.get(`/api/teams/${team.slug}`)).body.team.viewer.canDelete, true);
  await admin.http.post(`/api/teams/${team.id}/archive`);
  const archived = (await admin.http.get(`/api/teams/${team.slug}`)).body.team;
  assert.ok(archived.archivedAt);
  assert.equal(archived.viewer.canDelete, true);
  assert.equal((await admin.http.del(`/api/teams/${team.id}`)).status, 200);
  assert.equal((await admin.http.get(`/api/teams/${team.slug}`)).status, 404);
  assert.equal((await admin.http.del(`/api/teams/${team.id}`)).status, 404);
});

async function deletionTournament(status = "registration_open") {
  const { rows: [cup] } = await getPool().query(
    `INSERT INTO tournaments (slug, name, status, format, participant_mode, team_size, pairing_type)
     VALUES ('deletion-cup', 'Deletion cup', $1, 'swiss', 'team', 3, 'shield_sword') RETURNING *`, [status]
  );
  const { rows: rosters } = await getPool().query(
    `INSERT INTO tournament_team_rosters (tournament_id, team_id, name, name_key, team_name_snapshot)
     VALUES ($1, $2, 'Roster A', 'roster a', 'Amber Guard'),
            ($1, $2, 'Roster B', 'roster b', 'Amber Guard') RETURNING *`, [cup.id, team.id]
  );
  const { rows: members } = await getPool().query(
    `INSERT INTO tournament_team_roster_members (tournament_id, roster_id, user_id, slot, display_name_snapshot, faction_snapshot)
     VALUES ($1, $2, $4, 1, 'Leader', 'Kommandos'), ($1, $3, $5, 1, 'Member', 'Kommandos') RETURNING *`,
    [cup.id, rosters[0].id, rosters[1].id, leader.id, member.id]
  );
  return { cup, rosters, members };
}

test("deleting an unplayed team removes rosters and invitations but keeps players and personal games", async () => {
  const { cup } = await deletionTournament();
  const invitation = await leader.http.post(`/api/teams/${team.id}/invitations`, { userId: outsider.id });
  assert.equal(invitation.status, 201);
  const { rows: [game] } = await getPool().query(
    "INSERT INTO games (player_ids, status) VALUES ($1, 'completed') RETURNING id", [[leader.id, member.id]]
  );
  const deleted = await leader.http.del(`/api/teams/${team.id}`);
  assert.deepEqual(deleted, { status: 200, body: { deletedTeamId: team.id } });
  for (const table of ["player_teams", "player_team_memberships", "player_team_invitations", "tournament_team_rosters", "tournament_team_roster_members"]) {
    assert.equal((await getPool().query(`SELECT COUNT(*)::int AS count FROM ${table}`)).rows[0].count, 0, table);
  }
  assert.equal((await getPool().query("SELECT COUNT(*)::int AS count FROM users")).rows[0].count, 4);
  assert.equal((await getPool().query("SELECT id FROM games WHERE id = $1", [game.id])).rowCount, 1);
  assert.equal((await getPool().query("SELECT id FROM tournaments WHERE id = $1", [cup.id])).rowCount, 1);
  assert.deepEqual((await leader.http.get("/api/teams/dashboard")).body.myTeams, []);
  assert.deepEqual((await outsider.http.get("/api/teams/dashboard")).body.incomingInvitations, []);
  assert.deepEqual((await admin.http.get("/api/admin/teams")).body.teams, []);
  assert.deepEqual((await outsider.http.get("/api/leaderboards/teams")).body.teams, []);
  assert.equal((await outsider.http.post(`/api/team-invitations/${invitation.body.invitation.id}/accept`)).status, 404);
  const audit = (await getPool().query("SELECT * FROM player_team_audit_events WHERE event_type = 'team_delete'")).rows[0];
  assert.equal(audit.actor_user_id, leader.id);
  assert.equal(audit.team_id, null);
  assert.equal(audit.before.name, team.name);
  assert.equal((await leader.http.post("/api/teams", { name: team.name, slug: team.slug })).status, 201);
});

for (const phase of ["awaiting_roll", "in_progress", "completed"]) {
  test(`team deletion protects ${phase} matches even between two rosters of the same team`, async () => {
    const { cup, rosters, members } = await deletionTournament();
    const { rows: [round] } = await getPool().query(
      "INSERT INTO tournament_rounds (tournament_id, round_number, status) VALUES ($1, 1, 'active') RETURNING id", [cup.id]
    );
    const { rows: [match] } = await getPool().query(
      `INSERT INTO tournament_team_matches (tournament_id, round_id, round_number, bracket_position, roster_a_id, roster_b_id, phase)
       VALUES ($1, $2, 1, 1, $3, $4, $5) RETURNING id`, [cup.id, round.id, rosters[0].id, rosters[1].id, phase]
    );
    // A completed personal game must protect an unfinished team match too.
    if (phase === "in_progress") {
      const { rows: [game] } = await getPool().query(
        "INSERT INTO games (player_ids, status, source_type, source_id) VALUES ($1, 'completed', 'team_match_game', $2) RETURNING id",
        [[leader.id, member.id], match.id]
      );
      await getPool().query(
        `INSERT INTO tournament_team_match_games (team_match_id, game_id, slot, roster_a_member_id, roster_b_member_id, mission)
         VALUES ($1, $2, 1, $3, $4, '{}')`, [match.id, game.id, members[0].id, members[1].id]
      );
    }
    for (const player of [leader, admin]) {
      const profile = (await player.http.get(`/api/teams/${team.slug}`)).body;
      assert.equal(profile.stats.team_matches, 0, "public stats exclude internal matches");
      assert.equal(profile.team.viewer.canDelete, false);
      assert.equal(profile.team.viewer.deleteBlockedReason, "matches");
      const response = await player.http.del(`/api/teams/${team.id}`);
      assert.equal(response.status, 409);
      assert.match(response.body.error, /matches/);
    }
    assert.equal((await getPool().query("SELECT id FROM tournament_team_matches WHERE id = $1", [match.id])).rowCount, 1);
    assert.equal((await getPool().query("SELECT id FROM tournament_team_rosters WHERE team_id = $1", [team.id])).rowCount, 2);
    assert.equal((await getPool().query("SELECT id FROM player_team_memberships WHERE team_id = $1", [team.id])).rowCount, 2);
  });
}

test("an active tournament roster is protected before its first pairing", async () => {
  await deletionTournament("in_progress");
  const profile = (await leader.http.get(`/api/teams/${team.slug}`)).body.team;
  assert.equal(profile.viewer.canDelete, false);
  assert.equal(profile.viewer.deleteBlockedReason, "activeTournament");
  assert.equal((await admin.http.del(`/api/teams/${team.id}`)).status, 409);
});

test("concurrent team deletions produce one success and one not found", async () => {
  const responses = await Promise.all([leader.http.del(`/api/teams/${team.id}`), admin.http.del(`/api/teams/${team.id}`)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 404]);
  assert.equal((await getPool().query("SELECT id FROM player_team_audit_events WHERE event_type = 'team_delete'")).rowCount, 1);
});
