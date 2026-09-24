const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { TEST_DATABASE_URL } = require('../helpers/db');
const { migrate } = require('../../src/db/migrate');
const { createRouter } = require('../../src/http/router');
const { startApiServer } = require('../helpers/client');
const routes = require('../../src/api/routes');
const tournaments = require('../../src/api/tournaments');
const achievements = require('../../src/db/repositories/achievements');
const tournamentsRepo = require('../../src/db/repositories/tournaments');
let pool, client, server;
const admin = { id: 178, isAdmin: true };

test.before(async () => {
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await migrate(pool);
  server = await startApiServer(createRouter(routes, {
    withClient: fn => fn(client),
    withTransaction: async fn => {
      await client.query('SAVEPOINT http_request');
      try {
        const result = await fn(client);
        await client.query('RELEASE SAVEPOINT http_request');
        return result;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT http_request');
        throw error;
      }
    },
    loadUser: async (_, req) => req.headers['x-test-role'] === 'admin' ? admin :
      req.headers['x-test-role'] === 'player' ? { id: 124, isAdmin: false } : null
  }));
});
test.after(async () => { await server.close(); await pool.end(); });
test.beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`INSERT INTO users (id,name,name_key,password_hash,rating,is_admin) VALUES
    (178,'Tony','tony','s:h',1020,true),(124,'Corias','corias','s:h',1030,false),
    (176,'C','c','s:h',970,false),(162,'D','d','s:h',980,false);
    INSERT INTO tournaments (id,slug,name,status,format,swiss_round_count,tiebreaker_order)
      VALUES (10,'recalculate-cup','Recalculate cup','in_progress','swiss',2,ARRAY['vp_diff','strength_of_schedule','head_to_head']);
    INSERT INTO tournament_participants (id,tournament_id,user_id,display_name,display_name_key,seed,status,source) VALUES
      (124,10,178,'Tony','tony',1,'active','admin_manual'), (108,10,124,'Corias','corias',2,'active','admin_manual'),
      (120,10,176,'C','c',3,'active','admin_manual'), (110,10,162,'D','d',4,'active','admin_manual');
    INSERT INTO tournament_rounds (id,tournament_id,round_number,status) VALUES (80,10,1,'completed'),(81,10,2,'completed');
    ALTER TABLE tournament_matches DISABLE TRIGGER tournament_match_identity_guard;`);
  // Deliberately reconstruct pre-fix history, then restore all guards before requests.
  for (const [id, round, a, b, userA, userB, winner, recordedWinner, vpA, vpB] of [
    [199,81,124,108,178,124,124,124,13,15],
    [193,80,108,120,124,176,124,108,13,10],
    [195,80,110,124,162,178,178,124,8,17]
  ]) {
    const gameId = id + 170;
    const result = { winnerId: winner, scores: { [userA]: { total: vpA }, [userB]: { total: vpB } } };
    await client.query(`INSERT INTO games (id,player_ids,status,source_type,source_id,result,elo)
      VALUES ($1,$2,'completed','tournament_match',$3,$4,'{"preserve":"elo"}')`, [gameId,[userA,userB],id,result]);
    await client.query(`INSERT INTO tournament_matches (id,tournament_id,round_id,round_number,status,
      participant_a_id,participant_b_id,winner_participant_id,result,match_points,game_id)
      VALUES ($1,10,$2,$3,'completed',$4,$5,$6,$7,$8,$9)`,
    [id,round,round === 80 ? 1 : 2,a,b,recordedWinner,result,{ [a]: recordedWinner === a ? 3 : 0, [b]: recordedWinner === b ? 3 : 0 },gameId]);
    await client.query(`INSERT INTO game_participants (game_id,slot,user_id,tournament_participant_id,result_key,display_name_snapshot)
      VALUES ($1,1,$2,$3,$2,'A'),($1,2,$4,$5,$4,'B')`, [gameId,userA,a,userB,b]);
  }
  await client.query('ALTER TABLE tournament_matches ENABLE TRIGGER tournament_match_identity_guard');
});
test.afterEach(async () => { await client.query('ROLLBACK'); client.release(); });

async function request(body = {}, role = 'admin', id = 10) {
  const response = await fetch(`${server.baseUrl}/api/admin/tournaments/${id}/standings/recalculate`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-test-role': role }, body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}
async function publicView() {
  return tournaments.getPublic({ client, user: null, params: { slug: 'recalculate-cup' } });
}

test('admin replay repairs collision, points, W/L, ranks and opponents SoS without changing games or ratings', async () => {
  const gamesBefore = (await client.query('SELECT * FROM games ORDER BY id')).rows;
  const usersBefore = (await client.query('SELECT * FROM users ORDER BY id')).rows;
  const { status, body } = await request();
  assert.equal(status, 200);
  assert.equal(body.tournament.status, 'in_progress');
  assert.equal(body.tournament.finalResults, null);
  const rows = new Map(body.standings.map(r => [r.participantId,r]));
  assert.deepEqual([rows.get(108).wins,rows.get(108).losses,rows.get(108).matchPoints,rows.get(108).rank], [2,0,6,1]);
  assert.deepEqual([rows.get(124).wins,rows.get(124).losses,rows.get(124).matchPoints,rows.get(124).rank], [1,1,3,2]);
  assert.equal(rows.get(120).strengthOfSchedule, 6);
  assert.equal(rows.get(110).strengthOfSchedule, 3);
  const repaired = body.rounds[1].matches[0];
  assert.equal(repaired.winnerParticipantId, 108);
  assert.deepEqual(repaired.matchPoints, { 108: 3, 124: 0 });
  assert.deepEqual((await client.query('SELECT * FROM games ORDER BY id')).rows, gamesBefore);
  assert.deepEqual((await client.query('SELECT * FROM users ORDER BY id')).rows, usersBefore);
  assert.deepEqual((await publicView()).standings, body.standings);
  const audit = (await client.query("SELECT * FROM tournament_audit_events WHERE event_type='standings_recalculated'")).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_user_id, admin.id);
  assert.equal(audit[0].before.matches.find(m => m.id === 199).winnerParticipantId, 124);
  const repeated = await request();
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.recalculation.repairedMatches, 0);
  assert.deepEqual(repeated.body.standings, body.standings);
});

test('already repaired winner with stale points still gets fixed and published places/awards are recalculated explicitly', async () => {
  await client.query('UPDATE tournament_matches SET winner_participant_id=108 WHERE id=199');
  const stale = [124,108,120,110].map((participantId,index) => ({ participantId, rank: index+1,
    wins: participantId === 108 ? 2 : 1, matchPoints: 3, strengthOfSchedule: 3, note: 'Keep this note' }));
  await client.query("UPDATE tournaments SET status='completed', final_results=$1 WHERE id=10", [JSON.stringify(stale)]);
  await achievements.syncPodium(client, await tournamentsRepo.findById(client, 10), admin.id);
  assert.equal((await request()).status, 409);
  assert.deepEqual((await publicView()).tournament.finalResults, stale);
  const updated = await request({ replacePublished: true });
  assert.equal(updated.status, 200);
  const final = updated.body.tournament.finalResults;
  assert.deepEqual(final.slice(0,2).map(row => [row.participantId,row.rank,row.matchPoints]), [[108,1,6],[124,2,3]]);
  assert.equal(final.find(row => row.participantId === 120).strengthOfSchedule, 6);
  assert.ok(final.every(row => row.note === 'Keep this note'));
  assert.deepEqual((await publicView()).finalResults, final);
  const gold = (await client.query(`SELECT w.user_id FROM achievement_awards w JOIN achievements a ON a.id=w.achievement_id
    WHERE a.tournament_id=10 AND a.place=1`)).rows;
  assert.deepEqual(gold, [{ user_id: 124 }]);
});

test('anonymous/player requests are denied, missing tournaments and inactive tournaments are rejected', async () => {
  assert.equal((await request({}, '')).status, 401);
  assert.equal((await request({}, 'player')).status, 403);
  assert.equal((await request({}, 'admin', 999)).status, 404);
  await client.query("UPDATE tournaments SET status='draft' WHERE id=10");
  assert.equal((await request()).status, 409);
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_audit_events')).rows[0].n, 0);
});

test('an unresolvable game aborts the whole operation instead of partially fixing standings', async () => {
  await client.query(`UPDATE games SET result=jsonb_set(result,'{winnerId}','999'::jsonb) WHERE id=369`);
  const before = (await client.query('SELECT * FROM tournament_matches ORDER BY id')).rows;
  const response = await request();
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Match 199/);
  assert.deepEqual((await client.query('SELECT * FROM tournament_matches ORDER BY id')).rows, before);
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_audit_events')).rows[0].n, 0);
});

test('deleted and withdrawn opponents keep historical result keys and earned SoS points', async () => {
  await client.query('DELETE FROM users WHERE id=124');
  await client.query("UPDATE tournament_participants SET status='withdrawn' WHERE id=108");
  const response = await request();
  assert.equal(response.status, 200);
  const rows = response.body.standings;
  assert.ok(!rows.some(row => row.participantId === 108));
  assert.equal(rows.find(row => row.participantId === 120).strengthOfSchedule, 6);
  assert.equal(rows.find(row => row.participantId === 124).losses, 1);
  assert.equal(response.body.rounds[1].matches[0].winnerParticipantId, 108);
});
