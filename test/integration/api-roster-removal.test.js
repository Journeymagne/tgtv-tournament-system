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
const gamesRepo = require("../../src/db/repositories/games");
const matchesRepo = require("../../src/db/repositories/team-matches");
const usersRepo = require("../../src/db/repositories/users");
const { recomputeTeamMatch, recalculateTeamRatings } = require("../../src/api/team-tournaments");
let server, admin;
const authLimiter = createRateLimiter({ max: 1000, windowMs: 60000 });
test.before(async () => {
  await migrate(getPool());
  server = await startApiServer(createRouter(routes, { withClient, withTransaction, loadUser: loadUserFromRequest, authLimiter }));
});
test.after(async () => { await server?.close(); await closePool(); });
test.beforeEach(async () => {
  await getPool().query("TRUNCATE games, tournaments, player_teams, users RESTART IDENTITY CASCADE");
  authLimiter.reset();
  admin = await register("RemovalAdmin");
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
async function startedCup() {
  const { tournament: cup } = await expect(admin.http.post("/api/admin/tournaments", {
    name: "Roster removal", startsAt: "2026-09-18T10:00:00.000Z", format: "swiss", swissRoundCount: 3,
    participantMode: "team", teamSize: 3
  }), 201);
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/publish`));
  const teams = [];
  for (let index = 0; index < 4; index++) {
    const people = [];
    for (let slot = 0; slot < 3; slot++) people.push(await register(`Roster${index}Player${slot}`));
    const leader = people[0];
    const { team } = await expect(leader.http.post("/api/teams", { name: `Removal Team ${index}` }), 201);
    for (const person of people.slice(1)) {
      const { invitation } = await expect(leader.http.post(`/api/teams/${team.id}/invitations`, { userId: person.id }), 201);
      await expect(person.http.post(`/api/team-invitations/${invitation.id}/accept`));
    }
    const { roster } = await expect(leader.http.post(`/api/tournaments/${cup.id}/rosters`, {
      teamId: team.id, captainUserId: leader.id, members: people.map((p) => ({ userId: p.id, faction: "Kommandos" }))
    }), 201);
    teams.push({ people, roster });
  }
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/registration/close`));
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/start`, {
    tables: [{ killzone: "Volkus", deployment: 1 }, { killzone: "Gallowdark", deployment: 2 }, { killzone: "Octarius", deployment: 3 }]
  }));
  return { cup, teams };
}
const nextRound = (cup, body = {}) => expect(admin.http.post(`/api/admin/tournaments/${cup.id}/rounds/next`, body));
const detail = (cup) => expect(admin.http.get(`/api/admin/tournaments/${cup.id}`));
const remove = (cup, roster) => expect(admin.http.del(`/api/tournaments/${cup.id}/rosters/${roster.id}`));

async function personalGames(match, completedCount = 3) {
  await withTransaction(async (client) => {
    for (let slot = 0; slot < 3; slot++) {
      const a = match.rosterA.members[slot];
      const b = match.rosterB.members[slot];
      const game = await gamesRepo.insert(client, { sourceType: "team_match_game", sourceId: match.id, playerIds: [a.userId, b.userId] });
      await matchesRepo.insertGameLink(client, { teamMatchId: match.id, gameId: game.id, slot: slot + 1, rosterAMemberId: a.id, rosterBMemberId: b.id, mission: {} });
      if (slot < completedCount) {
        await gamesRepo.saveFinalResult(client, game.id, {
          result: { winnerId: a.userId, scores: { [a.userId]: { total: 15, tac: 5 }, [b.userId]: { total: 5, tac: 1 } } },
          elo: { [a.userId]: { before: 1000, after: 1016, delta: 16 }, [b.userId]: { before: 1000, after: 984, delta: -16 } },
          submittedBy: admin.id, newSubmission: true
        });
        await usersRepo.addRating(client, a.userId, 16, "tts");
        await usersRepo.addRating(client, b.userId, -16, "tts");
      } else if (slot === 1) {
        await gamesRepo.savePendingResult(client, game.id, { submittedBy: a.userId, pendingResult: { result: { winnerId: a.userId } } });
      }
    }
    await recomputeTeamMatch(client, match.id);
  });
}

test("only an admin removes a started roster; the first round handles three remaining rosters", async () => {
  const { cup, teams } = await startedCup();
  const roster = teams[0].roster;
  await expect(teams[0].people[0].http.del(`/api/tournaments/${cup.id}/rosters/${roster.id}`), 403);
  await expect(admin.http.del(`/api/tournaments/${cup.id}/rosters/999999`), 404);
  assert.equal((await remove(cup, roster)).resultsPreserved, true);
  await remove(cup, roster);
  const before = await detail(cup);
  assert.equal(before.rosters.find((r) => r.id === roster.id).status, "withdrawn");
  assert.equal(before.standings.length, 3);
  const preview = await expect(admin.http.get(`/api/admin/tournaments/${cup.id}/rounds/next/preview`));
  const pairings = preview.round.matches;
  assert.equal(pairings.filter((m) => m.rosterBId === null).length, 1);
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/rounds/next`, { matchups: [pairings[0], pairings[0]] }), 400);
  const generated = await nextRound(cup, { matchups: pairings });
  assert.ok(generated.teamMatches.every((m) => m.rosterAId !== roster.id && m.rosterBId !== roster.id));
  const bye = generated.teamMatches.find((m) => m.resolution === "bye");
  assert.equal(bye.phase, "completed");
  assert.equal(bye.teamTournamentPointsA, 2);
  assert.equal(bye.games.length, 0);
  assert.equal((await expect(createClient(server.baseUrl).get(`/api/team-matches/${bye.id}`))).teamMatch.resolution, "bye");
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/team-matches/${bye.id}/reset`, { phase: "awaiting_roll" }), 409);
  await expect(admin.http.del(`/api/admin/tournaments/${cup.id}/rounds/latest`));
  assert.equal((await detail(cup)).rounds.length, 0);
});

test("removal preserves completed games, opponent points and Elo; closes pending matches and allows later rounds and final standings", async () => {
  const { cup, teams } = await startedCup();
  const first = await nextRound(cup);
  for (const match of first.teamMatches) await personalGames(match);
  const second = await nextRound(cup);
  const roster = teams[0].roster;
  const openMatch = second.teamMatches.find((m) => m.roundNumber === 2 && [m.rosterAId, m.rosterBId].includes(roster.id));
  for (const match of second.teamMatches.filter((m) => m.roundNumber === 2)) await personalGames(match, match.id === openMatch.id ? 1 : 3);
  const roundOne = (await getPool().query("SELECT * FROM tournament_team_matches WHERE round_number = 1 ORDER BY id")).rows;
  const completedGames = (await getPool().query("SELECT * FROM games WHERE status = 'completed' ORDER BY id")).rows;
  const userRatings = (await getPool().query("SELECT id, rating_tts, rating_irl, rating_combined FROM users ORDER BY id")).rows;
  const teamRatings = (await getPool().query("SELECT id, rating_tts, rating_irl FROM player_teams ORDER BY id")).rows;
  await remove(cup, roster);
  const removed = await detail(cup);
  assert.deepEqual((await getPool().query("SELECT * FROM games WHERE status = 'completed' ORDER BY id")).rows, completedGames);
  assert.deepEqual((await getPool().query("SELECT * FROM tournament_team_matches WHERE round_number = 1 ORDER BY id")).rows, roundOne);
  assert.deepEqual((await getPool().query("SELECT id, rating_tts, rating_irl, rating_combined FROM users ORDER BY id")).rows, userRatings);
  const forfeit = removed.teamMatches.find((m) => m.id === openMatch.id);
  assert.equal(forfeit.resolution, "forfeit");
  assert.equal(forfeit.games.length, 1);
  assert.equal(removed.rounds.at(-1).status, "completed");
  const opponent = openMatch.rosterAId === roster.id ? openMatch.rosterBId : openMatch.rosterAId;
  const opponentStanding = removed.standings.find((r) => r.rosterId === opponent);
  assert.equal(opponentStanding.played, 2);
  assert.ok(opponentStanding.teamTournamentPoints >= 2);
  await withTransaction(recalculateTeamRatings);
  assert.deepEqual((await getPool().query("SELECT id, rating_tts, rating_irl FROM player_teams ORDER BY id")).rows, teamRatings);
  await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/team-matches/${openMatch.id}/reset`, { phase: "awaiting_roll", confirmResultsReset: true }), 409);
  const third = await nextRound(cup);
  const thirdMatches = third.teamMatches.filter((m) => m.roundNumber === 3);
  assert.equal(thirdMatches.length, 2);
  assert.ok(thirdMatches.every((m) => m.rosterAId !== roster.id && m.rosterBId !== roster.id));
  assert.equal(thirdMatches.filter((m) => m.resolution === "bye").length, 1);
  for (const match of thirdMatches.filter((m) => !m.resolution)) await personalGames(match);
  const final = await expect(admin.http.post(`/api/admin/tournaments/${cup.id}/standings/publish`));
  assert.equal(final.finalResults.length, 3);
  const another = teams.find((team) => team.roster.id !== roster.id).roster;
  await remove(cup, another);
  const revised = await detail(cup);
  assert.equal(revised.tournament.status, "completed");
  assert.equal(revised.finalResults.length, 2);
  assert.deepEqual(revised.finalResults.map((r) => r.rank), [1, 2]);
  assert.ok(revised.finalResults.every((r) => r.rosterId !== another.id && r.rosterId !== roster.id));
});
