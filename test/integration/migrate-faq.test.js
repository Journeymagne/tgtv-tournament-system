const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { TEST_DATABASE_URL } = require('../helpers/db');
const { migrate, MIGRATIONS } = require('../../src/db/migrate');
let pool;
test.before(() => {
  const target = new URL(TEST_DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname) && /test/.test(target.pathname));
  pool = new Pool({ connectionString: TEST_DATABASE_URL });
});
test.after(async () => { await pool.end(); });
test.beforeEach(async () => { await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public'); });

test('5.4.0 upgrade adds FAQ without changing existing accounts, sessions or ratings', async () => {
  await pool.query('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  for (const migration of MIGRATIONS.filter(m => m.version <= 47)) {
    await migration.up(pool);
    await pool.query('INSERT INTO schema_migrations(version,name) VALUES($1,$2)', [migration.version, migration.name]);
  }
  const { rows: [user] } = await pool.query(`INSERT INTO users(name,name_key,password_hash,rating)
    VALUES('Existing player','existing player','preserved-hash',1234) RETURNING id`);
  await pool.query(`INSERT INTO sessions(token,user_id,expires_at) VALUES('preserved-session',$1,NOW()+INTERVAL '1 day')`, [user.id]);
  const sessions = (await pool.query('SELECT * FROM sessions')).rows;
  assert.deepEqual(await migrate(pool), [48, 49, 50]);
  assert.deepEqual((await pool.query('SELECT password_hash,rating,is_faq_moderator FROM users WHERE id=$1', [user.id])).rows[0],
    { password_hash: 'preserved-hash', rating: 1234, is_faq_moderator: false });
  assert.deepEqual((await pool.query('SELECT * FROM sessions')).rows, sessions);
  const counts = (await pool.query(`SELECT content->>'category' category,COUNT(*)::int n
    FROM faq_entries GROUP BY content->>'category' ORDER BY category`)).rows;
  assert.deepEqual(counts, [{ category: 'community', n: 34 }, { category: 'conduct', n: 17 },
    { category: 'info', n: 1 }, { category: 'official', n: 97 }]);
  await pool.query(`UPDATE faq_entries SET content=jsonb_set(content,'{answer}','"Edited text"') WHERE id='community-017'`);
  assert.deepEqual(await migrate(pool), []);
  assert.equal((await pool.query(`SELECT content->>'answer' answer FROM faq_entries WHERE id='community-017'`)).rows[0].answer, 'Edited text');
});

test('Info migration preserves edited principles, records history and moves only open corrections', async () => {
  await migrate(pool);
  const id = 'community-017';
  await pool.query(`UPDATE faq_entries SET revision=7,content=content||$2::jsonb WHERE id=$1`,
    [id, JSON.stringify({ category: 'community', answer: 'Customized principle', sourceUrl: 'https://example.com/source' })]);
  const before = (await pool.query('SELECT content FROM faq_entries WHERE id=$1', [id])).rows[0].content;
  for (const status of ['pending', 'needs_changes', 'accepted', 'rejected']) {
    await pool.query('INSERT INTO faq_submissions(id,entry_id,content,status) VALUES($1,$2,$3,$4)',
      [randomUUID(), id, JSON.stringify(before), status]);
  }
  const migration = MIGRATIONS.find(m => m.version === 49);
  await migration.up(pool);
  const after = (await pool.query('SELECT content,revision FROM faq_entries WHERE id=$1', [id])).rows[0];
  assert.deepEqual(after, { content: { ...before, category: 'info' }, revision: 8 });
  const audit = (await pool.query('SELECT action,snapshot FROM faq_history WHERE entry_id=$1', [id])).rows;
  assert.deepEqual(audit, [{ action: 'moved_to_info', snapshot: { before, after: after.content } }]);
  const corrections = (await pool.query(`SELECT status,content->>'category' category FROM faq_submissions ORDER BY status`)).rows;
  assert.deepEqual(corrections, [{ status: 'accepted', category: 'community' }, { status: 'needs_changes', category: 'info' },
    { status: 'pending', category: 'info' }, { status: 'rejected', category: 'community' }]);
  await migration.up(pool);
  assert.equal((await pool.query('SELECT COUNT(*)::int n FROM faq_history WHERE entry_id=$1', [id])).rows[0].n, 1);
});
