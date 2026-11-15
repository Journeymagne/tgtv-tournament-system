const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('../helpers/db');
const { migrate } = require('../../src/db/migrate');
const users = require('../../src/db/repositories/users');
const teams = require('../../src/db/repositories/player-teams');
const rosters = require('../../src/db/repositories/team-rosters');
const tournaments = require('../../src/db/repositories/tournaments');
const rounds = require('../../src/db/repositories/tournament-rounds');
const matches = require('../../src/db/repositories/team-matches');
const games = require('../../src/db/repositories/games');
const api = require('../../src/api/tournaments');
let pool, client, owner, a, b, zero, cup, rosterA, rosterB, round;
const user = name => users.insert(client, { name, passwordHash: 'test', rating: 1000, isAdmin: false });

test.before(async () => {
  pool = new Pool(require('../helpers/schema').poolOptions);
  await require('../helpers/schema').resetSchemas(pool);
  await migrate(pool);
});
test.after(async () => pool.end());
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query('TRUNCATE accounts.users RESTART IDENTITY CASCADE');
  owner = await user('Owner'); a = await user('Alice'); b = await user('Bob'); zero = await user('Zero');
  cup = await tournaments.insert(client, { ownerUserId: owner.id, slug: 'personal-cup', name: 'Personal Cup',
    format: 'swiss', swissRoundCount: 3, participantMode: 'team', teamSize: 3, pairingType: 'shield_sword' });
  await client.query("UPDATE tournaments SET status='in_progress' WHERE id=$1", [cup.id]);
  const team = await teams.insert(client, { slug: 'personal-team', name: 'Team', nameKey: 'team', leaderUserId: a.id });
  const makeRoster = (name, members) => rosters.insert(client, { tournamentId: cup.id, teamId: team.id, name,
    nameKey: name.toLowerCase(), captainUserId: members[0].id, registeredByUserId: owner.id, teamNameSnapshot: 'Team' },
    members.map((item, index) => ({ userId: item.id, slot: index + 1, displayNameSnapshot: item.name, factionSnapshot: 'Kommandos' })));
  rosterA = await makeRoster('Alpha', [a, zero]); rosterB = await makeRoster('Beta', [b]);
  round = await rounds.insert(client, { tournamentId: cup.id, roundNumber: 1, status: 'active' });
  await client.query('COMMIT');
});
test.afterEach(() => client.release());

async function personalGame(vpA = 15, vpB = 8, roundNumber = 1) {
  const selectedRound = roundNumber === 1 ? round : await rounds.insert(client, { tournamentId: cup.id, roundNumber, status: 'active' });
  await client.query('BEGIN');
  try {
    const match = await matches.insert(client, { tournamentId: cup.id, roundId: selectedRound.id, roundNumber,
      bracketPosition: 1, rosterAId: rosterA.id, rosterBId: rosterB.id });
    const game = await games.insert(client, { playerIds: [a.id, b.id], sourceType: 'team_match_game', sourceId: match.id, sourceSlot: 1,
      participants: [a, b].map(item => ({ userId: item.id, resultKey: item.id, displayNameSnapshot: item.name, factionSnapshot: 'Kommandos' })) });
    await matches.insertGameLink(client, { teamMatchId: match.id, gameId: game.id, slot: 1,
      rosterAMemberId: rosterA.members[0].id, rosterBMemberId: rosterB.members[0].id });
    await games.saveFinalResult(client, game.id, { result: { winnerId: vpA === vpB ? null : vpA > vpB ? a.id : b.id,
      scores: { [a.id]: { total: vpA }, [b.id]: { total: vpB } } }, elo: null });
    await matches.update(client, match.id, { phase: 'in_progress' });
    await client.query('COMMIT');
    return { match, game };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
const publicView = () => api.getPublic({ client, user: null, params: { slug: cup.slug }, query: new URLSearchParams() });
const adminView = () => api.getAdmin({ client, user: { ...owner, isAdmin: true, isSuperAdmin: true }, params: { id: cup.id }, query: new URLSearchParams() });

test('team results remain live until the organizer explicitly finishes; judge, incomplete and repeated completion are rejected', async () => {
  const params = { id: cup.id };
  await assert.rejects(api.publishFinalStandingsAdmin({ client, user: owner, params, body: {} }), { status: 409 });
  const { match } = await personalGame();
  await matches.update(client, match.id, { phase: 'completed', resolution: 'forfeit', teamTournamentPointsA: 2, teamTournamentPointsB: 0 });
  await rounds.update(client, round.id, { status: 'completed' });
  await tournaments.update(client, cup.id, { swissRoundCount: 1 });
  await rosters.update(client, rosterA.id, { status: 'active' });
  await rosters.update(client, rosterB.id, { status: 'active' });
  const live = await publicView();
  assert.equal(live.tournament.status, 'in_progress');
  assert.equal(live.tournament.finalResults, null);
  const judge = { ...b, managedTournamentIds: [cup.id] };
  await assert.rejects(api.publishFinalStandingsAdmin({ client, user: judge, params, body: {} }), { status: 403 });
  const completed = await api.publishFinalStandingsAdmin({ client, user: owner, params, body: {} });
  assert.equal(completed.tournament.status, 'completed');
  assert.equal(completed.tournament.finalResults.length, 2);
  assert.equal(completed.tournament.viewer.canFinish, true);
  assert.equal((await publicView()).tournament.status, 'completed');
  const completedAt = completed.tournament.completedAt;
  await assert.rejects(api.publishFinalStandingsAdmin({ client, user: owner, params, body: {} }), { status: 409 });
  assert.equal((await publicView()).tournament.completedAt, completedAt);
});

test('public and administrator payloads expose the same solo-style personal GP standings during a live team match', async () => {
  await personalGame();
  const before = await client.query('SELECT final_results FROM tournaments WHERE id=$1', [cup.id]);
  const guest = await publicView(), admin = await adminView();
  assert.deepEqual(guest.individualStandings, admin.individualStandings);
  const alice = guest.individualStandings.find(row => row.userId === a.id);
  assert.deepEqual([alice.matchPoints, alice.totalGp, alice.gpDiff, alice.gamesPlayed], [3, 17, 14, 1]);
  assert.equal(guest.individualStandings.find(row => row.userId === b.id).gpDiff, -14);
  assert.equal(guest.individualStandings.find(row => row.userId === zero.id).gamesPlayed, 0);
  assert.equal(guest.teamMatches[0].phase, 'in_progress');
  assert.equal(guest.standings[0].teamTournamentPoints, 0);
  assert.deepEqual((await client.query('SELECT final_results FROM tournaments WHERE id=$1', [cup.id])).rows, before.rows);
  const compact = await api.getPublic({ client, params: { slug: cup.slug }, query: new URLSearchParams({ compact: '1' }) });
  assert.deepEqual(compact.individualStandings, guest.individualStandings);
});

test('reopening a game removes its personal score; subsequent confirmations recalculate it', async () => {
  const { game } = await personalGame();
  await games.clearResult(client, game.id);
  let row = (await publicView()).individualStandings.find(item => item.userId === a.id);
  assert.deepEqual([row.matchPoints, row.totalGp, row.gpDiff], [0, 0, 0]);
  await games.saveFinalResult(client, game.id, { result: { winnerId: null, scores: { [a.id]: { total: 5 }, [b.id]: { total: 5 } } }, elo: null });
  row = (await publicView()).individualStandings.find(item => item.userId === a.id);
  assert.deepEqual([row.matchPoints, row.totalGp, row.gpDiff], [1, 10, 0]);
});

test('historical members keep their result without exposing history or hidden factions in the public roster payload', async () => {
  await personalGame();
  await client.query('UPDATE tournament_team_roster_members SET ended_at=NOW() WHERE id=$1', [rosterA.members[0].id]);
  const replacement = await user('Replacement');
  await rosters.insertMember(client, rosterA, { userId: replacement.id, slot: 1, displayNameSnapshot: replacement.name, factionSnapshot: 'Kasrkin' }, owner.id);
  const guest = await publicView();
  assert.equal(guest.individualStandings.find(row => row.userId === a.id).matchPoints, 3);
  assert.equal(guest.individualStandings.find(row => row.userId === replacement.id).matchPoints, 0);
  assert.equal(guest.rosters.find(row => row.id === rosterA.id).members.some(member => member.userId === a.id), false);
  assert.doesNotMatch(JSON.stringify(guest.individualStandings), /faction|telegramContact|passwordHash/);
});
