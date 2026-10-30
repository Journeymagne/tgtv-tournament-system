const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { poolOptions, resetSchemas } = require('../helpers/schema');
const { migrateThrough } = require('../helpers/migrate-through');
const { migrate } = require('../../src/db/migrate');
const matches = require('../../src/db/repositories/tournament-matches');
const games = require('../../src/db/repositories/games');
let pool;

test.before(() => { pool = new Pool(poolOptions); });
test.after(async () => { await pool.end(); });
test.beforeEach(async () => {
  await resetSchemas(pool);
  await migrateThrough(pool, 78);
  await pool.query(`
    INSERT INTO tournaments(id,slug,status,format) VALUES (1,'normalize','in_progress','swiss'),(2,'other','in_progress','swiss');
    INSERT INTO tournament_rounds(id,tournament_id,round_number,status) VALUES (1,1,1,'active'),(2,2,1,'active');
    INSERT INTO tournament_participants(id,tournament_id,display_name,display_name_key,status,source)
      VALUES (11,1,'Guest A','a','active','admin_manual'),(12,1,'Guest B','b','active','admin_manual');
    INSERT INTO tournament_matches(id,tournament_id,round_id,round_number,status,participant_a_id,participant_b_id)
      VALUES (21,1,1,1,'active',11,12);
  `);
});

test('upgrade preserves unlinked guest history, canonical results, conflict evidence and JSON-null byes', async () => {
  const result = { winnerId: -11, scores: { '-11': { total: 15 }, '-12': { total: 8 } } };
  await pool.query(`UPDATE tournament_matches SET status='completed',result=$1,winner_participant_id=11,elo='{"legacy":42}' WHERE id=21`, [result]);
  await pool.query(`INSERT INTO tournament_matches(tournament_id,round_id,round_number,status,is_bye,participant_a_id,
    winner_participant_id,result,pending_result,elo) VALUES(1,1,1,'completed',true,11,11,'null','null','null')`);
  // Insert a second, linked match with different compatibility and canonical metadata.
  await pool.query(`INSERT INTO games(id,player_ids,status,source_type,source_id,result,elo)
    VALUES(31,'{}','completed','tournament_match',22,$1,'{"canonical":7}')`, [result]);
  await pool.query(`INSERT INTO tournament_matches(id,tournament_id,round_id,round_number,status,participant_a_id,participant_b_id,
    winner_participant_id,game_id,result,elo) VALUES(22,1,1,1,'completed',11,12,11,31,$1,'{"legacy":8}')`, [result]);
  const old = (await pool.query('SELECT * FROM tournament_matches WHERE id=22')).rows[0];
  assert.deepEqual(await migrate(pool), [79,80]);
  const stored = await matches.findById(pool, 21);
  assert.equal(stored.result.winnerId, -11);
  assert.deepEqual(stored.result.scoresByParticipantId, { 11: { total: 15 }, 12: { total: 8 } });
  assert.deepEqual(stored.elo, { legacy: 42 });
  assert.deepEqual((await matches.findById(pool, 22)).elo, { canonical: 7 });
  const archive = (await pool.query('SELECT match_before,game_before FROM result_migration_archive WHERE match_id=22')).rows[0];
  assert.deepEqual(archive.match_before.elo, old.elo);
  assert.deepEqual(archive.game_before.elo, { canonical: 7 });
  assert.equal((await pool.query('SELECT game_id FROM tournament_matches WHERE is_bye')).rows[0].game_id, null);
  const columns = (await pool.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='tournaments' AND table_name='tournament_matches'`)).rows.map(r => r.column_name);
  for (const column of ['result','pending_result','elo','submitted_by_user_id']) assert.ok(!columns.includes(column));
  const participants = (await pool.query('SELECT result_key FROM game_participants WHERE game_id=$1 ORDER BY slot', [stored.gameId])).rows;
  assert.deepEqual(participants.map(p => p.result_key), [-11,-12]);
  assert.deepEqual(await migrate(pool), []);
});

test('ambiguous duplicate sources abort without deleting or overwriting games', async () => {
  await pool.query(`INSERT INTO games(player_ids,status,source_type,source_id,result)
    VALUES('{}','completed','tournament_match',21,'{"old":1}'),('{}','completed','tournament_match',21,'{"old":2}')`);
  const before = (await pool.query('SELECT * FROM games ORDER BY id')).rows;
  await assert.rejects(migrate(pool), error => error.code === '23505');
  assert.deepEqual((await pool.query('SELECT * FROM games ORDER BY id')).rows, before);
  assert.equal((await pool.query('SELECT version FROM schema_migrations WHERE version>=79')).rowCount, 0);
});

test('a replacement snapshot preserves the result key and name of a deleted account', async () => {
  await pool.query(`ALTER TABLE tournament_matches DISABLE TRIGGER tournament_match_identity_guard`);
  await pool.query(`UPDATE tournament_matches SET status='completed',winner_participant_id=11,result=$1,
    participant_snapshots=$2 WHERE id=21`, [
    { winnerId: 701, scores: { 701: { total: 15 }, '-12': { total: 8 } } },
    { 11: { userId: null, resultKey: 701, displayName: 'Original player', faction: 'Kommandos', isProxy: false } }
  ]);
  await pool.query(`ALTER TABLE tournament_matches ENABLE TRIGGER tournament_match_identity_guard`);
  await migrate(pool);
  const match = await matches.findById(pool, 21);
  const player = (await pool.query('SELECT * FROM game_participants WHERE game_id=$1 AND slot=1', [match.gameId])).rows[0];
  assert.equal(player.result_key, 701);
  assert.equal(player.user_id, null);
  assert.equal(player.display_name_snapshot, 'Original player');
  assert.equal(player.faction_snapshot, 'Kommandos');
  assert.equal(match.result.scoresByParticipantId[11].total, 15);
});

test('canonical writes stay single, direct result corruption fails at commit and source uniqueness handles races', async () => {
  await migrate(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = { winnerId: -11, scores: { '-11': { total: 15 }, '-12': { total: 8 } } };
    const match = await matches.update(client, 21, { status: 'completed', result, winnerParticipantId: 11 });
    assert.deepEqual((await games.findById(client, match.gameId)).result, result);
    assert.equal((await matches.findById(client, 21)).result.winnerId, -11);
    await client.query('COMMIT');
    await client.query('BEGIN');
    await client.query('UPDATE games SET result=$1 WHERE id=$2', [{ ...result, winnerId: -12 },match.gameId]);
    await assert.rejects(client.query('COMMIT'), error => error.code === '23514');
    await client.query('ROLLBACK');
    assert.equal((await matches.findById(client, 21)).result.winnerId, -11);

    const writers = await Promise.allSettled([pool.query(`INSERT INTO games(player_ids,status,source_type,source_id)
      VALUES('{}','open','tournament_match',999)`), pool.query(`INSERT INTO games(player_ids,status,source_type,source_id)
      VALUES('{}','open','tournament_match',999)`)]);
    assert.equal(writers.filter(w => w.status === 'fulfilled').length, 1);
    assert.equal(writers.find(w => w.status === 'rejected').reason.code, '23505');
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('team slots are independent sources and all scalar links stay inside their tournament and side', async () => {
  await migrate(pool);
  await pool.query(`
    INSERT INTO tournament_team_rosters(id,tournament_id,name,name_key,team_name_snapshot)
      VALUES(41,1,'A','a','A'),(42,1,'B','b','B'),(43,2,'Foreign','f','Foreign');
    INSERT INTO tournament_team_roster_members(id,tournament_id,roster_id,slot,display_name_snapshot,faction_snapshot)
      VALUES(51,1,41,1,'A',''),(52,1,42,1,'B',''),(53,2,43,1,'Foreign','');
    INSERT INTO tournament_tables(id,tournament_id,table_number) VALUES(61,1,1),(62,2,1);
    INSERT INTO tournament_team_matches(id,tournament_id,round_id,round_number,bracket_position,roster_a_id,roster_b_id)
      VALUES(71,1,1,1,1,41,42);
    INSERT INTO games(id,player_ids,status,source_type,source_id,source_slot)
      VALUES(81,'{}','open','team_match_game',71,1),(82,'{}','open','team_match_game',71,2);
    INSERT INTO tournament_team_match_games(id,team_match_id,game_id,slot,roster_a_member_id,roster_b_member_id,mission,table_id)
      VALUES(91,71,81,1,51,52,'{}',61);
  `);
  const invalid = [
    'UPDATE tournament_matches SET table_id=62 WHERE id=21',
    'UPDATE tournament_team_roster_members SET tournament_id=2 WHERE id=51',
    'UPDATE tournament_team_matches SET round_id=2 WHERE id=71',
    'UPDATE tournament_team_matches SET roster_b_id=43 WHERE id=71',
    'UPDATE tournament_team_matches SET shield_a_member_id=52 WHERE id=71',
    'UPDATE tournament_team_matches SET sword_a_member_id=51 WHERE id=71',
    'UPDATE tournament_team_match_games SET roster_a_member_id=53 WHERE id=91',
    'UPDATE tournament_team_match_games SET table_id=62 WHERE id=91'
  ];
  for (const sql of invalid) await assert.rejects(pool.query(sql), error => error.code === '23503');
  await pool.query('UPDATE tournament_team_matches SET shield_a_member_id=51,sword_a_member_id=52 WHERE id=71');
  await assert.rejects(pool.query(`INSERT INTO games(player_ids,status,source_type,source_id,source_slot)
    VALUES('{}','open','team_match_game',71,1)`), error => error.code === '23505');
  await assert.rejects(pool.query('UPDATE games SET source_slot=3 WHERE id=81'), error => error.code === '23503');
  await pool.query('DELETE FROM tournament_tables WHERE id=61');
  const link = (await pool.query('SELECT * FROM tournament_team_match_games WHERE id=91')).rows[0];
  assert.equal(link.table_id, null);
  assert.equal(link.tournament_id, 1);
  await pool.query('DELETE FROM tournament_rounds WHERE id=1');
  assert.equal((await pool.query('SELECT * FROM tournament_team_match_games WHERE id=91')).rowCount, 0);
});
