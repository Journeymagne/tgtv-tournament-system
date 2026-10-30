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

test('team sessions persist short courses and award separate achievements across sessions and devices', async () => {
  const team = 'hand-of-the-archon';
  const fixtures = [1, 2, 3].map(n => ({ ...bank.questions[0], id: 'hoa-test-' + n, team, difficulty: 3,
    references: [{ title: 'Power From Pain', url: 'https://wahapedia.ru/kill-team3/kill-teams/hand-of-the-archon/#Power-From-Pain' }] }));
  const ids = fixtures.map(q => q.id);
  const { rows: existingTeamQuestions } = await pool.query("SELECT id,status FROM knowthykt.training_questions WHERE content->>'team'=$1", [team]);
  try {
    await pool.query("UPDATE knowthykt.training_questions SET status='review' WHERE content->>'team'=$1", [team]);
    for (const q of fixtures) await pool.query('INSERT INTO knowthykt.training_questions(id,content) VALUES($1,$2)', [q.id, JSON.stringify(q)]);
    await pool.query('UPDATE knowthykt.training_bank_state SET revision=revision+1');
    const user = await actor(), admin = await actor(true);
    const initial = (await request('progress', user)).state;
    const body = { sessionId: randomUUID(), mode: 'mixed', team, revision: initial.revision, replaceSessionId: null };
    let result = await request('sessions', user, body);
    assert.equal(result.status, 200);
    assert.equal(result.state.active.team, team);
    assert.equal(result.state.active.items.length, 3);
    assert.ok(result.state.active.items.every(item => ids.includes(item.questionId)));
    assert.equal((await request('sessions', user, { ...body, team: 'core' })).status, 409, 'idempotency includes course identity');
    const sessionId = result.state.active.id;
    const first = result.state.active.items[0];
    result = await request(`sessions/${sessionId}/answers`, user, { revision: result.state.revision,
      questionId: first.questionId, questionVersion: 1, selected: fixtures[0].answer });
    assert.equal(result.state.teamAchievements[0].solved, 1);
    assert.equal(result.state.teamAchievements[0].earned, false);
    assert.equal(result.state.journey.xp, initial.journey.xp);
    assert.equal(result.state.journey.total, initial.journey.total);
    // A second session, as on another device, retains the first correct answer.
    result = await request('sessions', user, { sessionId: randomUUID(), mode: 'mixed', team,
      revision: result.state.revision, replaceSessionId: sessionId });
    const secondId = result.state.active.id;
    for (const item of [...result.state.active.items]) {
      result = await request(`sessions/${secondId}/answers`, user, { revision: result.state.revision,
        questionId: item.questionId, questionVersion: 1,
        selected: item.questionId === first.questionId ? (fixtures[0].answer + 1) % 4 : fixtures[0].answer });
      assert.equal(result.status, 200);
      result = await request(`sessions/${secondId}/advance`, user, { revision: result.state.revision, questionId: item.questionId });
      assert.equal(result.status, 200);
    }
    assert.equal(result.state.active, null);
    assert.equal(result.state.completedCount, 1);
    assert.equal(result.state.teamAchievements[0].earned, true, 'a later mistake does not revoke an earlier correct answer');
    const awardedAt = result.state.teamAchievements[0].earnedAt;
    assert.ok(awardedAt);
    const fresh = (await request('progress', { ...user })).state;
    assert.equal(fresh.teamAchievements[0].earnedAt, awardedAt);
    const repo = require('../../src/db/repositories/training');
    const visible = await repo.publicTeamAchievements(pool, user.id);
    assert.equal(visible[0].earnedAt, awardedAt);
    assert.equal(visible[0].solved, 3);
    const target = await current(ids[0]);
    const edited = await request(`moderation/${target.id}`, admin, decision(target, 'save', { question: target.question + ' Clarified.' }));
    assert.equal(edited.question.team, team);
    assert.deepEqual(edited.question.references, fixtures[0].references);
    const afterReview = (await request('progress', user)).state;
    assert.equal(afterReview.teamAchievements[0].total, 2);
    assert.equal(afterReview.teamAchievements[0].earnedAt, awardedAt);
    assert.ok(afterReview.stats[target.id]);
    const coreSession = await start(user);
    assert.ok(coreSession.state.active.items.every(item => !ids.includes(item.questionId)));
  } finally {
    await pool.query('DELETE FROM knowthykt.training_question_events WHERE question_id=ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM knowthykt.training_questions WHERE id=ANY($1::text[])', [ids]);
    for (const q of existingTeamQuestions) await pool.query('UPDATE knowthykt.training_questions SET status=$2 WHERE id=$1', [q.id, q.status]);
  }
});
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
