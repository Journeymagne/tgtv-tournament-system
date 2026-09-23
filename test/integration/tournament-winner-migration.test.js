const test = require("node:test");
const assert = require("node:assert/strict");
const { Pool } = require("pg");
const { TEST_DATABASE_URL } = require("../helpers/db");
const { migrate } = require("../../src/db/migrate");
const repair = require("../../src/db/migrations/034_tournament_winner_identity");
const tournamentsApi = require("../../src/api/tournaments");

let pool;
let client;
test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await migrate(pool);
});
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query("BEGIN");
  // Reproduce the pre-035 database: the new guard correctly forbids these corrupt fixtures.
  // DDL is rolled back after each case, restoring the guard for other tests.
  await client.query("ALTER TABLE tournament_matches DISABLE TRIGGER tournament_match_identity_guard");
  await client.query(`INSERT INTO users (id, name, name_key, password_hash, rating)
    VALUES (178, 'Tony Te Amo', 'tony', 's:h', 1020), (124, 'corias', 'corias', 's:h', 1030),
      (176, 'C', 'c', 's:h', 970), (162, 'D', 'd', 's:h', 980)`);
  await client.query(`INSERT INTO tournaments (id, slug, name, status, format, tiebreaker_order)
    VALUES (10, 'identity-repair', 'Identity repair', 'completed', 'swiss', ARRAY['strength_of_schedule'])`);
  await client.query(`INSERT INTO tournament_participants
    (id, tournament_id, user_id, display_name, display_name_key, seed, status, source)
    VALUES (124, 10, 178, 'Tony Te Amo', 'tony', 13, 'finished', 'admin_manual'),
      (108, 10, 124, 'corias', 'corias', 3, 'finished', 'admin_manual'),
      (120, 10, 176, 'C', 'c', 4, 'finished', 'admin_manual'),
      (110, 10, 162, 'D', 'd', 5, 'finished', 'admin_manual')`);
  await client.query(`INSERT INTO tournament_rounds (id, tournament_id, round_number, status)
    VALUES (80, 10, 1, 'completed'), (81, 10, 2, 'completed')`);
});
test.afterEach(async () => {
  await client.query("ROLLBACK");
  client.release();
});

async function addMatch({ id = 199, gameId = 369, a = 124, b = 108, userA = 178, userB = 124,
  winner = 124, recordedWinner = 124, round = 81, totals = [13, 15] } = {}) {
  const result = { winnerId: winner, scores: { [userA]: { total: totals[0] }, [userB]: { total: totals[1] } } };
  await client.query(`INSERT INTO games (id, player_ids, status, source_type, source_id, result, elo)
    VALUES ($1, $2, 'completed', 'tournament_match', $3, $4, '{"preserve":"elo"}')`,
    [gameId, [userA, userB].filter(id => id > 0), id, result]);
  await client.query(`INSERT INTO tournament_matches
    (id, tournament_id, round_id, round_number, status, participant_a_id, participant_b_id,
      winner_participant_id, result, match_points, game_id)
    VALUES ($1, 10, $2, $3, 'completed', $4, $5, $6, $7, $8, $9)`,
    [id, round, round === 80 ? 1 : 2, a, b, recordedWinner, result,
      { [a]: recordedWinner === a ? 3 : 0, [b]: recordedWinner === b ? 3 : 0 }, gameId]);
}

test("migration repairs game 369 collision and published statistics, preserving manual places and canonical games", async () => {
  await addMatch();
  await addMatch({ id: 193, gameId: 363, a: 108, b: 120, userA: 124, userB: 176, winner: 124,
    recordedWinner: 108, round: 80, totals: [13, 10] });
  await addMatch({ id: 195, gameId: 365, a: 110, b: 124, userA: 162, userB: 178, winner: 178,
    recordedWinner: 124, round: 80, totals: [8, 17] });
  const finalResults = [124, 108, 120, 110].map((id, index) => ({ participantId: id, rank: index + 1,
    wins: 2, matchPoints: 6, strengthOfSchedule: 6, note: "Organizer's order" }));
  await client.query("UPDATE tournaments SET final_results = $1 WHERE id = 10", [JSON.stringify(finalResults)]);
  const gamesBefore = (await client.query("SELECT * FROM games ORDER BY id")).rows;
  const usersBefore = (await client.query("SELECT * FROM users ORDER BY id")).rows;
  const correctMatchesBefore = (await client.query("SELECT * FROM tournament_matches WHERE id <> 199 ORDER BY id")).rows;
  await repair.up(client);
  const repaired = (await client.query("SELECT * FROM tournament_matches WHERE id = 199")).rows[0];
  assert.equal(repaired.winner_participant_id, 108);
  assert.deepEqual(repaired.match_points, { 124: 0, 108: 3 });
  assert.deepEqual((await client.query("SELECT * FROM games ORDER BY id")).rows, gamesBefore);
  assert.deepEqual((await client.query("SELECT * FROM users ORDER BY id")).rows, usersBefore);
  assert.deepEqual((await client.query("SELECT * FROM tournament_matches WHERE id <> 199 ORDER BY id")).rows, correctMatchesBefore);
  const view = await tournamentsApi.getPublic({ client, user: null, params: { slug: "identity-repair" } });
  assert.equal(view.rounds[1].matches[0].winnerParticipantId, 108);
  const byId = new Map(view.finalResults.map(row => [row.participantId, row]));
  assert.equal(byId.get(124).wins, 1);
  assert.equal(byId.get(124).losses, 1);
  assert.equal(byId.get(124).matchPoints, 3);
  assert.equal(byId.get(108).wins, 2);
  assert.equal(byId.get(108).matchPoints, 6);
  assert.equal(byId.get(120).strengthOfSchedule, 6);
  assert.equal(byId.get(110).strengthOfSchedule, 3);
  assert.deepEqual(view.finalResults.map(row => [row.participantId, row.rank, row.note]),
    finalResults.map(row => [row.participantId, row.rank, row.note]));
  const audit = (await client.query("SELECT * FROM tournament_audit_events ORDER BY id")).rows;
  assert.equal(audit.length, 2);
  assert.equal(audit[0].before.winnerParticipantId, 124);
  assert.equal(audit[0].after.winnerParticipantId, 108);
  assert.equal(audit[1].metadata.reviewStandings, true);
  const snapshot = (await client.query("SELECT * FROM tournament_matches ORDER BY id")).rows;
  await repair.up(client);
  assert.deepEqual((await client.query("SELECT * FROM tournament_matches ORDER BY id")).rows, snapshot);
  assert.deepEqual((await client.query("SELECT * FROM tournament_audit_events ORDER BY id")).rows, audit);
});

test("migration leaves draws, byes and unresolvable historical identities unchanged", async () => {
  await addMatch({ winner: null, recordedWinner: null, totals: [13, 13] });
  await addMatch({ id: 200, gameId: 370, winner: 999, recordedWinner: 108 });
  await client.query(`INSERT INTO tournament_matches
    (id, tournament_id, round_id, round_number, status, is_bye, participant_a_id, winner_participant_id, match_points)
    VALUES (201, 10, 80, 1, 'completed', true, 120, 120, '{"120":3}')`);
  const before = (await client.query("SELECT * FROM tournament_matches ORDER BY id")).rows;
  await repair.up(client);
  assert.deepEqual((await client.query("SELECT * FROM tournament_matches ORDER BY id")).rows, before);
  assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM tournament_audit_events")).rows[0].n, 0);
});

test("migration distinguishes a guest participant ID from the registered opponent's user ID", async () => {
  await client.query("UPDATE tournament_participants SET user_id = NULL WHERE id = 124");
  await addMatch({ userA: -124 });
  await repair.up(client);
  assert.equal((await client.query("SELECT winner_participant_id FROM tournament_matches WHERE id = 199")).rows[0].winner_participant_id, 108);
});
