const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { TEST_DATABASE_URL } = require('../helpers/db');
const { migrate } = require('../../src/db/migrate');
const matches = require('../../src/db/repositories/tournament-matches');
const { buildStandings } = require('../../src/domain/tournaments/standings');
const { tournamentMatchView } = require('../../src/api/views');
const result = { winnerId: 124, scores: { 178: { total: 13 }, 124: { total: 15 } } };
let pool;
let client;

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrate(pool);
});
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`INSERT INTO users (id, name, name_key, password_hash) VALUES
    (178, 'Tony', 'tony', 's:h'), (124, 'Corias', 'corias', 's:h');
    INSERT INTO tournaments (id, slug, name, status, format) VALUES
      (10, 'identity-a', 'A', 'in_progress', 'swiss'), (20, 'identity-b', 'B', 'in_progress', 'swiss');
    INSERT INTO tournament_participants (id, tournament_id, user_id, display_name, display_name_key, status, source)
      VALUES (124, 10, 178, 'Tony', 'tony', 'active', 'admin_manual'),
        (108, 10, 124, 'Corias', 'corias', 'active', 'admin_manual'),
        (200, 20, NULL, 'Guest', 'guest', 'active', 'admin_manual');
    INSERT INTO tournament_rounds (id, tournament_id, round_number, status) VALUES
      (80, 10, 1, 'active'), (90, 20, 1, 'active');
    INSERT INTO tournament_matches (id, tournament_id, round_id, round_number, status, participant_a_id, participant_b_id)
      VALUES (199, 10, 80, 1, 'active', 124, 108);`);
});
test.afterEach(async () => { await client.query('ROLLBACK'); client.release(); });

async function rejected(sql, values, code = '23514') {
  await client.query('SAVEPOINT bad_write');
  await assert.rejects(client.query(sql, values), error => error.code === code);
  await client.query('ROLLBACK TO SAVEPOINT bad_write');
}

test('SQL and repository writes cannot store a colliding user ID as the losing participant', async () => {
  await rejected(`UPDATE tournament_matches SET status='completed', winner_participant_id=124, result=$1 WHERE id=199`, [result]);
  const match = await matches.update(client, 199, { status: 'completed', result,
    winnerParticipantId: 108, matchPoints: { 124: 0, 108: 3 } });
  assert.equal(match.winnerParticipantId, 108);
  assert.deepEqual(match.result.scoresByParticipantId, { 124: { total: 13 }, 108: { total: 15 } });
  assert.equal(tournamentMatchView(match).winnerParticipantPublicId, 'tpt_108');
  await rejected('UPDATE tournament_matches SET winner_participant_id=124 WHERE id=199');
  await rejected('UPDATE tournament_matches SET winner_participant_id=NULL WHERE id=199');
  const standings = buildStandings([
    { id: 124, userId: 178, status: 'active' }, { id: 108, userId: 124, status: 'active' }
  ], [match], ['head_to_head']);
  assert.deepEqual(standings.map(s => [s.participant.id, s.wins, s.losses, s.matchPoints, s.totalVp]),
    [[108, 1, 0, 3, 15], [124, 0, 1, 0, 13]]);
});

test('DB rejects out-of-match winners, cross-tournament sides/rounds and wrong game links', async () => {
  await rejected('UPDATE tournament_matches SET winner_participant_id=200 WHERE id=199');
  await rejected('UPDATE tournament_matches SET participant_b_id=200 WHERE id=199', [], '23503');
  await rejected('UPDATE tournament_matches SET round_id=90 WHERE id=199', [], '23503');
  await rejected('UPDATE tournament_matches SET participant_b_id=124 WHERE id=199');
  // SQL CHECK must not accidentally pass UNKNOWN when the other side is NULL.
  await rejected('UPDATE tournament_matches SET participant_b_id=NULL, winner_participant_id=200 WHERE id=199');
  await client.query(`INSERT INTO games (id, player_ids, status, source_type, source_id) VALUES (369, ARRAY[178,124], 'open', 'tournament_match', 200)`);
  await rejected('UPDATE tournament_matches SET game_id=369 WHERE id=199');
  await rejected('UPDATE tournament_participants SET tournament_id=20 WHERE id=124', [], '23503');
});

test('draws and byes remain valid; guest keys never use the positive participant ID', async () => {
  await matches.update(client, 199, { status: 'completed', result: { ...result, winnerId: null }, winnerParticipantId: null });
  await rejected('UPDATE tournament_matches SET winner_participant_id=108 WHERE id=199');
  await client.query('UPDATE tournament_participants SET user_id=NULL WHERE id=124');
  const guestResult = { winnerId: -124, scores: { '-124': { total: 16 }, 124: { total: 15 } } };
  const match = await matches.update(client, 199, { result: guestResult, winnerParticipantId: 124 });
  assert.equal(match.result.scoresByParticipantId[124].total, 16);
  await client.query(`INSERT INTO tournament_matches (tournament_id, round_id, round_number, status,
    is_bye, participant_a_id, winner_participant_id) VALUES (10,80,1,'completed',true,108,108)`);
});

test('account deletion preserves the original game key and participant score snapshots', async () => {
  await client.query(`INSERT INTO games (id, player_ids, status, source_type, source_id) VALUES (369,ARRAY[178,124],'completed','tournament_match',199);
    INSERT INTO game_participants (game_id, slot, user_id, tournament_participant_id, result_key, display_name_snapshot)
      VALUES (369,1,178,124,178,'Tony'), (369,2,124,108,124,'Corias');`);
  await matches.update(client, 199, { gameId: 369, status: 'completed', result, winnerParticipantId: 108 });
  await client.query('DELETE FROM users WHERE id=124');
  const match = await matches.update(client, 199, { result });
  const standings = buildStandings([{ id: 124, userId: 178 }, { id: 108, userId: null }], [match]);
  assert.equal(standings[0].participant.id, 108);
  assert.equal(standings[0].totalVp, 15);
});

test('upgrade snapshots resolvable scores without guessing or rejecting unrelated legacy winners', async () => {
  await client.query(`DROP TRIGGER tournament_match_identity_guard ON tournament_matches;
    DROP FUNCTION guard_tournament_match_identity();
    ALTER TABLE tournament_matches DROP CONSTRAINT tournament_match_winner_side,
      DROP CONSTRAINT tournament_match_distinct_sides, DROP CONSTRAINT tournament_match_a_scope,
      DROP CONSTRAINT tournament_match_b_scope, DROP CONSTRAINT tournament_match_round_scope;
    DROP INDEX tournament_participants_identity_scope;
    DROP INDEX tournament_rounds_identity_scope;
    UPDATE tournament_matches SET status='completed', winner_participant_id=200 WHERE id=199;`);
  await client.query('UPDATE tournament_matches SET result=$1 WHERE id=199', [{ ...result, winnerId: 999 }]);
  await require('../../src/db/migrations/035_tournament_identity_guards').up(client);
  const match = await matches.findById(client, 199);
  assert.equal(match.winnerParticipantId, 200); // Unknown history is not silently rewritten.
  assert.deepEqual(match.result.scoresByParticipantId, { 124: { total: 13 }, 108: { total: 15 } });
  const constraints = (await client.query(`SELECT convalidated FROM pg_constraint
    WHERE conname IN ('tournament_match_winner_side', 'tournament_match_a_scope', 'tournament_match_b_scope')`)).rows;
  assert.equal(constraints.length, 3);
  assert.ok(constraints.every(c => c.convalidated === false));
  await rejected('UPDATE tournament_matches SET winner_participant_id=200 WHERE id=199');
});
