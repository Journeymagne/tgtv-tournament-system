const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
require('../helpers/db');
const { migrate } = require('../../src/db/migrate');
const { createRouter } = require('../../src/http/router');
const { loadUserFromRequest } = require('../../src/api/auth');
const bank = require('../../src/domain/training');
let pool, server, origin;

test.before(async () => {
  pool = new Pool(require('../helpers/schema').poolOptions);
  await migrate(pool);
  const withClient = async fn => { const client = await pool.connect(); try { return await fn(client); } finally { client.release(); } };
  const withTransaction = fn => withClient(async client => {
    await client.query('BEGIN');
    try { const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  });
  server = http.createServer(createRouter(require('../../src/api/training').routes, { withClient, withTransaction, loadUser: loadUserFromRequest }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.beforeEach(async () => {
  await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
  await pool.query(`UPDATE knowthykt.training_questions q SET content=seed.value,status='active',version=1,revision=1
    FROM jsonb_array_elements($1::jsonb) seed WHERE q.id=seed.value->>'id'`, [JSON.stringify(bank.questions)]);
  await pool.query('UPDATE knowthykt.training_bank_state SET revision=revision+1');
});
test.after(async () => {
  await pool.query(`UPDATE knowthykt.training_questions q SET content=seed.value,version=1,revision=1,
    status=CASE WHEN q.id IN ('kt-083','kt-086') THEN 'review' ELSE 'active' END
    FROM jsonb_array_elements($1::jsonb) seed WHERE q.id=seed.value->>'id'`, [JSON.stringify(bank.questions)]);
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});
async function request(path, actor, body, extraHeaders = {}) {
  const response = await fetch(origin + '/api/training/' + path, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json',
      ...(actor ? { Cookie: actor.cookie, 'X-Training-Account': String(actor.id), 'X-CSRF-Token': actor.csrf || '' } : {}), ...extraHeaders },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, ...await response.json() };
}
async function actor(admin = false) {
  const name = randomUUID(), token = randomUUID();
  const { rows: [user] } = await pool.query('INSERT INTO users(name,name_key,password_hash,rating,is_admin) VALUES($1,$1,$2,1000,$3) RETURNING id', [name, 'test:hash', admin]);
  await pool.query("INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 day')", [token, user.id]);
  const value = { id: user.id, cookie: 'sid=' + token };
  value.csrf = (await request('progress', value)).csrfToken;
  return value;
}
const report = q => ({ requestId: randomUUID(), questionVersion: q.version, questionRevision: q.revision, comment: 'Rule needs review' });
const decision = (q, action, changes = {}) => ({ requestId: randomUUID(), action, revision: q.revision, question: { ...q, ...changes }, comment: 'Editorial decision' });
async function current(id) { return (await request('questions')).questions.find(q => q.id === id); }
async function start(user) {
  const { state } = await request('progress', user);
  return request('sessions', user, { sessionId: randomUUID(), mode: 'mixed', revision: state.revision, replaceSessionId: state.active?.id || null });
}

test('report requires account/CSRF, withdraws globally and replaces unanswered session items without scoring', async () => {
  const user = await actor(), admin = await actor(true);
  const { state } = await start(user), old = state.active.items[0], q = await current(old.questionId), body = report(q);
  assert.equal((await request('progress', user)).state.revision, state.revision, 'reading JSONB snapshots must not change the profile revision');
  assert.equal((await request(`questions/${q.id}/report`, null, body)).status, 401);
  assert.equal((await request(`questions/${q.id}/report`, user, body, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await request(`questions/${q.id}/report`, user, body, { Origin: 'https://another.example' })).status, 403);
  assert.equal((await request('moderation', user)).status, 403);
  assert.equal((await request(`moderation/${q.id}`, user, decision(q, 'delete'))).status, 403);
  const result = await request(`questions/${q.id}/report`, user, body);
  assert.equal(result.status, 200);
  assert.equal((await current(q.id)).status, 'review');
  assert.notEqual(result.state.active.items[0].questionId, q.id);
  assert.deepEqual(result.state.stats, {});
  assert.equal(result.state.journey.total, bank.questions.length - 1, 'Slop leaves curriculum immediately');
  assert.equal(new Set(result.state.active.items.map(item => item.questionId)).size, 20);
  assert.equal((await request(`sessions/${state.active.id}/answers`, user, { revision: state.revision, questionId: q.id, questionVersion: q.version, selected: 0 })).status, 409);
  assert.equal((await request(`questions/${q.id}/report`, user, body)).status, 200);
  assert.equal((await request(`moderation/${q.id}`, admin)).events.filter(event => event.action === 'report').length, 1);
  const next = await start(user);
  assert.ok(next.state.active.items.every(item => item.questionId !== q.id));
});

test('earned XP and titles survive Slop; restoration requests recertification once across devices', async () => {
  const user = await actor(), admin = await actor(true);
  const stats = Object.fromEntries(bank.questions.map(q => [q.id, { attempts: 2, correct: 2, xp: q.difficulty * 20 }]));
  const missing = bank.questions[0];
  delete stats[missing.id];
  await pool.query('UPDATE knowthykt.training_profiles SET stats=$2 WHERE user_id=$1', [user.id, JSON.stringify(stats)]);
  const before = (await request('progress', user)).state;
  assert.equal(before.journey.rank.id, 'tryhard');
  await request(`questions/${missing.id}/report`, user, report(await current(missing.id)));
  const reduced = (await request('progress', user)).state;
  assert.equal(reduced.journey.rank.id, 'judge');
  assert.equal(reduced.journey.total, bank.questions.length - 1);
  await request(`moderation/${missing.id}`, admin, decision(await current(missing.id), 'restore'));
  const pending = (await request('progress', user)).state;
  assert.equal(pending.journey.rank.id, 'judge');
  assert.equal(pending.journey.recertification, true);
  assert.equal(pending.journey.xp, before.journey.xp);
  const notifications = () => pool.query("SELECT * FROM knowthykt.notification_messages WHERE user_id=$1 AND payload->>'type'='knowthykt_recertification'", [user.id]);
  const notices = (await notifications()).rows;
  assert.equal(notices.length, 1);
  assert.equal(notices[0].payload.href, '/knowthykt#journey');
  await request('progress', user);
  await request('progress', user);
  assert.equal((await notifications()).rows.length, 1);
  assert.equal((await request('progress', user)).state.revision, pending.revision);
  await request(`questions/${missing.id}/report`, user, report(await current(missing.id)));
  await request(`moderation/${missing.id}`, admin, decision(await current(missing.id), 'restore'));
  assert.equal((await notifications()).rows.length, 1, 'restoring the same course does not resend a read notification');
  const credited = await current(bank.questions[1].id);
  await request(`questions/${credited.id}/report`, user, report(credited));
  const withdrawn = (await request('progress', user)).state;
  assert.equal(withdrawn.journey.xp, before.journey.xp);
  assert.deepEqual(withdrawn.stats[credited.id], stats[credited.id]);
  const achievement = await require('../../src/db/repositories/training').publicJourney(pool, user.id);
  assert.equal(achievement.rank.id, 'judge');
  assert.equal(achievement.xp, before.journey.xp);
  assert.equal(achievement.recertification, true);
  assert.deepEqual((await notifications()).rows, notices, 'a different course keeps the original notice unchanged');
  stats[missing.id] = { attempts: 2, correct: 2, xp: missing.difficulty * 20 };
  await pool.query('UPDATE knowthykt.training_profiles SET stats=$2 WHERE user_id=$1', [user.id, JSON.stringify(stats)]);
  const completed = (await request('progress', user)).state;
  assert.equal(completed.journey.rank.id, 'judge');
  assert.equal(completed.journey.recertification, false);
  // Even a later recertification after qualifying and clearing the inbox is silent.
  await pool.query("DELETE FROM knowthykt.notification_messages WHERE user_id=$1 AND payload->>'type'='knowthykt_recertification'", [user.id]);
  delete stats[missing.id];
  await pool.query('UPDATE knowthykt.training_profiles SET stats=$2 WHERE user_id=$1', [user.id, JSON.stringify(stats)]);
  assert.equal((await request('progress', user)).state.journey.recertification, true);
  assert.equal((await notifications()).rows.length, 0);
});

test('editing/restoring is revision guarded, preserves checked snapshots and does not revive a report retry', async () => {
  const user = await actor(), admin = await actor(true);
  const { state } = await start(user), item = state.active.items[0], q = await current(item.questionId);
  const checked = await request(`sessions/${state.active.id}/answers`, user, { revision: state.revision, questionId: q.id, questionVersion: q.version, selected: q.answer });
  assert.equal(checked.status, 200);
  const body = report(q);
  await request(`questions/${q.id}/report`, user, body);
  const queued = await current(q.id);
  assert.equal((await request(`moderation/${q.id}`, admin, decision(q, 'restore'))).status, 409);
  const invalid = decision(queued, 'restore', { source: { ...q.source, url: 'javascript:alert(1)' } });
  assert.equal((await request(`moderation/${q.id}`, admin, invalid)).status, 400);
  const restored = await request(`moderation/${q.id}`, admin, decision(queued, 'restore', { question: q.question + ' Clarified.', answer: (q.answer + 1) % 4 }));
  assert.equal(restored.question.status, 'active');
  assert.equal(restored.question.version, 2);
  const saved = (await request('progress', user)).state;
  assert.equal(saved.active.items[0].question.question, q.question);
  assert.equal(saved.active.items[0].question.answer, q.answer);
  assert.equal(saved.active.items[0].correct, true);
  assert.equal(saved.stats[q.id].correct, 1);
  await request(`questions/${q.id}/report`, user, body);
  assert.equal((await current(q.id)).status, 'active');
  const commented = await request(`moderation/${q.id}`, admin, decision(restored.question, 'comment'));
  assert.equal(commented.question.version, 2);
  assert.equal(commented.question.status, 'active');
  const removed = await request(`moderation/${q.id}`, admin, decision(commented.question, 'delete'));
  assert.equal(removed.question.status, 'deleted');
  assert.equal((await request('questions')).journey.total, bank.questions.length - 1);
  assert.equal((await request('progress', user)).state.active.items[0].question.question, q.question);
});

test('last-resort skips do not become errors and too-small pools cannot start sessions', async () => {
  const user = await actor();
  const { state } = await start(user);
  await pool.query("UPDATE knowthykt.training_questions SET status='review',revision=revision+1");
  await pool.query('UPDATE knowthykt.training_bank_state SET revision=revision+1');
  const { state: updated } = await request('progress', user);
  assert.ok(updated.active.items.every(item => item.skipped && item.selected === null && item.correct === null));
  assert.equal((await start(user)).status, 409);
  const next = await request(`sessions/${updated.active.id}/advance`, user, { questionId: updated.active.items[0].questionId, revision: updated.revision });
  assert.equal(next.status, 200);
  assert.equal(next.state.active.cursor, 1);
  assert.deepEqual(next.state.stats, {});
});

test('unanswered revisions refresh before grading and a moved question leaves its old difficulty session', async () => {
  const user = await actor(), admin = await actor(true);
  const before = (await request('progress', user)).state;
  const started = await request('sessions', user, { sessionId: randomUUID(), mode: '1', revision: before.revision, replaceSessionId: null });
  const first = await current(started.state.active.items[0].questionId);
  await request(`moderation/${first.id}`, admin, decision(first, 'restore', { difficulty: 2 }));
  const changed = (await request('progress', user)).state;
  assert.notEqual(changed.active.items[0].questionId, first.id);
  assert.ok(changed.active.items.every(item => item.question.difficulty === 1));
  const q = await current(changed.active.items[0].questionId), answer = (q.answer + 1) % 4;
  await request(`moderation/${q.id}`, admin, decision(q, 'restore', { answer, question: q.question + ' Revised.' }));
  assert.equal((await request(`sessions/${changed.active.id}/answers`, user, { questionId: q.id, questionVersion: q.version, selected: q.answer, revision: changed.revision })).status, 409);
  const refreshed = (await request('progress', user)).state;
  assert.equal(refreshed.active.items[0].question.version, q.version + 1);
  assert.equal(refreshed.active.items[0].question.answer, answer);
  const result = await request(`sessions/${changed.active.id}/answers`, user, { questionId: q.id, questionVersion: q.version + 1, selected: answer, revision: refreshed.revision });
  assert.equal(result.status, 200);
  assert.equal(result.state.stats[q.id].attempts, 1);
  assert.equal(result.state.active.items[0].correct, true);
});
