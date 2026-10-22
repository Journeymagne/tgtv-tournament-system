const seed = require('../../domain/training');

function view(row) {
  return { ...row.content, id: row.id, status: row.status, version: row.version,
    revision: row.revision, updatedAt: row.updated_at,
    ...(row.version > 1 ? { original: seed.byId.get(row.id) } : {}) };
}
async function load(client, exclusive = false) {
  // Always lock the bank BEFORE an account profile. Reports/edits serialize with
  // session creation and answers, so a committed report stops subsequent grading.
  const { rows: [state] } = await client.query('SELECT revision FROM knowthykt.training_bank_state WHERE id=TRUE FOR ' + (exclusive ? 'UPDATE' : 'SHARE'));
  const { rows } = await client.query('SELECT * FROM knowthykt.public_questions ORDER BY id');
  const questions = rows.map(view);
  return { revision: state.revision, questions, byId: new Map(questions.map(q => [q.id, q])),
    active: questions.filter(q => q.status === 'active'), curriculum: questions.filter(q => q.status !== 'deleted') };
}
async function changed(client) {
  await client.query('UPDATE knowthykt.training_bank_state SET revision=revision+1 WHERE id=TRUE');
}
async function event(client, id, user, action, comment, snapshot, requestId = null) {
  await client.query(`INSERT INTO knowthykt.training_question_events(question_id,actor_id,request_id,action,comment,snapshot)
    VALUES($1,$2,$3,$4,$5,$6)`, [id, user.id, requestId, action, comment, JSON.stringify(snapshot)]);
}
module.exports = { load, changed, event, view };
