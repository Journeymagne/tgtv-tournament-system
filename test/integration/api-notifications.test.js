const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const notificationsApi = require("../../src/api/notifications");
const usersRepo = require("../../src/db/repositories/users");
const gamesRepo = require("../../src/db/repositories/games");

let pool;
let client;
let alpha;
let bravo;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(pool);
});

test.after(async () => {
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
  client = await pool.connect();
  alpha = await usersRepo.insert(client, {
    name: "Alpha", passwordHash: "s:h", registerNickname: "", telegramContact: "@a",
    rating: 1000, isAdmin: false
  });
  bravo = await usersRepo.insert(client, {
    name: "Bravo", passwordHash: "s:h", registerNickname: "", telegramContact: "@b",
    rating: 1000, isAdmin: false
  });
});

test.afterEach(() => {
  client.release();
});

async function listFor(user) {
  return notificationsApi.list({ client, user });
}

async function createIndividualPairing() {
  const { rows: tournamentRows } = await client.query(
    `INSERT INTO tournaments (owner_user_id, slug, name, status, format)
     VALUES ($1, 'individual-cup', 'Individual Cup', 'in_progress', 'swiss') RETURNING id`,
    [alpha.id]
  );
  const tournamentId = tournamentRows[0].id;
  const { rows: roundRows } = await client.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, status)
     VALUES ($1, 1, 'active') RETURNING id`,
    [tournamentId]
  );
  const { rows: participantRows } = await client.query(
    `INSERT INTO tournament_participants
       (tournament_id, user_id, display_name, display_name_key, faction, seed, status, source)
     VALUES
       ($1, $2, 'Alpha', 'alpha', 'Kasrkin', 1, 'active', 'self_join'),
       ($1, $3, 'Bravo', 'bravo', 'Legionaries', 2, 'active', 'self_join')
     RETURNING id, user_id, display_name, faction`,
    [tournamentId, alpha.id, bravo.id]
  );
  const byUser = new Map(participantRows.map((row) => [row.user_id, row]));
  const { rows: tableRows } = await client.query(
    `INSERT INTO tournament_tables (tournament_id, table_number, killzone)
     VALUES ($1, 4, 'Volkus') RETURNING id`,
    [tournamentId]
  );
  const { rows: matchRows } = await client.query(
    `INSERT INTO tournament_matches
       (tournament_id, round_id, round_number, status, participant_a_id, participant_b_id, table_id, mission)
     VALUES ($1, $2, 1, 'active', $3, $4, $5, $6::jsonb) RETURNING id`,
    [
      tournamentId,
      roundRows[0].id,
      byUser.get(alpha.id).id,
      byUser.get(bravo.id).id,
      tableRows[0].id,
      JSON.stringify({ critOp: "Loot" })
    ]
  );
  return gamesRepo.insert(client, {
    challengeId: null,
    playerIds: [alpha.id, bravo.id],
    sourceType: "tournament_match",
    sourceId: matchRows[0].id,
    participants: participantRows.map((row) => ({
      userId: row.user_id,
      tournamentParticipantId: row.id,
      resultKey: row.user_id,
      displayNameSnapshot: row.display_name,
      factionSnapshot: row.faction
    }))
  });
}

async function createTeamPairing() {
  const { rows: tournamentRows } = await client.query(
    `INSERT INTO tournaments
       (owner_user_id, slug, name, status, format, participant_mode, team_size, pairing_type)
     VALUES ($1, 'team-cup', 'Team Cup', 'in_progress', 'swiss', 'team', 3, 'shield_sword')
     RETURNING id`,
    [alpha.id]
  );
  const tournamentId = tournamentRows[0].id;
  const { rows: roundRows } = await client.query(
    `INSERT INTO tournament_rounds (tournament_id, round_number, status)
     VALUES ($1, 2, 'active') RETURNING id`,
    [tournamentId]
  );
  const { rows: teamRows } = await client.query(
    `INSERT INTO player_teams (slug, name, name_key, leader_user_id)
     VALUES ('alpha-team', 'Alpha Team', 'alpha team', $1),
            ('bravo-team', 'Bravo Team', 'bravo team', $2)
     RETURNING id, slug`,
    [alpha.id, bravo.id]
  );
  const teamBySlug = new Map(teamRows.map((row) => [row.slug, row]));
  const { rows: rosterRows } = await client.query(
    `INSERT INTO tournament_team_rosters
       (tournament_id, team_id, name, name_key, captain_user_id, registered_by_user_id,
        seed, status, team_name_snapshot, started_at)
     VALUES
       ($1, $2, 'Alpha Roster', 'alpha roster', $4, $4, 1, 'active', 'Alpha Team', NOW()),
       ($1, $3, 'Bravo Roster', 'bravo roster', $5, $5, 2, 'active', 'Bravo Team', NOW())
     RETURNING id, team_id`,
    [
      tournamentId,
      teamBySlug.get("alpha-team").id,
      teamBySlug.get("bravo-team").id,
      alpha.id,
      bravo.id
    ]
  );
  const rosterByTeam = new Map(rosterRows.map((row) => [row.team_id, row]));
  const alphaRoster = rosterByTeam.get(teamBySlug.get("alpha-team").id);
  const bravoRoster = rosterByTeam.get(teamBySlug.get("bravo-team").id);
  const { rows: memberRows } = await client.query(
    `INSERT INTO tournament_team_roster_members
       (tournament_id, roster_id, user_id, slot, display_name_snapshot, faction_snapshot)
     VALUES
       ($1, $2, $4, 1, 'Alpha', 'Kasrkin'),
       ($1, $3, $5, 1, 'Bravo', 'Legionaries')
     RETURNING id, roster_id, user_id`,
    [tournamentId, alphaRoster.id, bravoRoster.id, alpha.id, bravo.id]
  );
  const memberByUser = new Map(memberRows.map((row) => [row.user_id, row]));
  const { rows: matchRows } = await client.query(
    `INSERT INTO tournament_team_matches
       (tournament_id, round_id, round_number, bracket_position, roster_a_id, roster_b_id, phase)
     VALUES ($1, $2, 2, 1, $3, $4, 'in_progress') RETURNING id`,
    [tournamentId, roundRows[0].id, alphaRoster.id, bravoRoster.id]
  );
  const game = await gamesRepo.insert(client, {
    challengeId: null,
    playerIds: [alpha.id, bravo.id],
    sourceType: "team_match_game",
    sourceId: matchRows[0].id,
    participants: [
      { userId: alpha.id, resultKey: alpha.id, displayNameSnapshot: alpha.name, factionSnapshot: "Kasrkin" },
      { userId: bravo.id, resultKey: bravo.id, displayNameSnapshot: bravo.name, factionSnapshot: "Legionaries" }
    ]
  });
  await client.query(
    `INSERT INTO tournament_team_match_games
       (team_match_id, game_id, slot, roster_a_member_id, roster_b_member_id, mission)
     VALUES ($1, $2, 1, $3, $4, $5::jsonb)`,
    [
      matchRows[0].id,
      game.id,
      memberByUser.get(alpha.id).id,
      memberByUser.get(bravo.id).id,
      JSON.stringify({ critOp: "Secure" })
    ]
  );
  return game;
}

test("active inbox aggregates challenges and invitations and keeps read items active", async () => {
  const { rows: challengeRows } = await client.query(
    `INSERT INTO challenges (from_user_id, to_user_id, status)
     VALUES ($1, $2, 'pending') RETURNING id`,
    [bravo.id, alpha.id]
  );
  const { rows: teamRows } = await client.query(
    `INSERT INTO player_teams (slug, name, name_key, leader_user_id)
     VALUES ('bravo-team', 'Bravo Team', 'bravo team', $1) RETURNING id`,
    [bravo.id]
  );
  await client.query(
    `INSERT INTO player_team_invitations (team_id, invitee_user_id, invited_by_user_id)
     VALUES ($1, $2, $3)`,
    [teamRows[0].id, alpha.id, bravo.id]
  );

  const beforeRead = await listFor(alpha);
  assert.deepEqual(beforeRead.items.map((item) => item.type).sort(), ["game_challenge", "team_invitation"]);
  assert.equal(beforeRead.unreadCount, 2);
  assert.match(beforeRead.items.find((item) => item.type === "game_challenge").href, /^#\/mygames\/challenge\/\d+$/);

  await notificationsApi.markRead({ client, user: alpha, body: { through: beforeRead.generatedAt } });
  const afterRead = await listFor(alpha);
  assert.equal(afterRead.items.length, 2);
  assert.equal(afterRead.unreadCount, 0);

  await client.query("UPDATE challenges SET status = 'declined' WHERE id = $1", [challengeRows[0].id]);
  await client.query("UPDATE player_teams SET archived_at = NOW() WHERE id = $1", [teamRows[0].id]);
  const inactive = await listFor(alpha);
  assert.equal(inactive.items.length, 0);
});

test("individual and captain-completed team pairings create personal notifications", async () => {
  const individualGame = await createIndividualPairing();
  const teamGame = await createTeamPairing();

  const inbox = await listFor(alpha);
  const individual = inbox.items.find((item) => item.type === "tournament_pairing");
  const team = inbox.items.find((item) => item.type === "team_tournament_pairing");
  assert.equal(individual.gameId, individualGame.id);
  assert.equal(individual.opponent.name, "Bravo");
  assert.equal(individual.roundNumber, 1);
  assert.match(individual.href, /games\/tournament-match/);
  assert.equal(team.gameId, teamGame.id);
  assert.equal(team.opponentTeam.name, "Bravo Roster");
  assert.equal(team.mission.critOp, "Secure");
  assert.equal(team.href, `#/games/game/${teamGame.id}`);

  await client.query("UPDATE games SET status = 'completed' WHERE id = ANY($1::int[])", [[individualGame.id, teamGame.id]]);
  const completed = await listFor(alpha);
  assert.equal(completed.items.length, 0);
});
