const { randomUUID } = require('node:crypto');
const { HttpError } = require('../../http/io');
const { MAX_SAVED } = require('../../domain/tierlists');
const FIELDS = 'id,user_id,title,season_id,rankings,revision,created_at,updated_at';
function view(row, includeRows = true) {
  return { id: row.id, title: row.title, seasonId: row.season_id, revision: row.revision,
    ...(includeRows ? { rows: row.rankings } : {}),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}
async function seasons(client) {
  return (await client.query('SELECT id,label,starts_at,ends_at FROM tierlists.tierlist_seasons ORDER BY position,id')).rows;
}
async function hasSeason(client, id) {
  return (await client.query('SELECT 1 FROM tierlists.tierlist_seasons WHERE id=$1', [id])).rowCount > 0;
}
async function list(client, userId, seasonId = null) {
  const result = await client.query(`SELECT id,title,season_id,revision,created_at,updated_at FROM tierlists.saved_tierlists
    WHERE user_id=$1 AND ($2::TEXT IS NULL OR season_id=$2) ORDER BY updated_at DESC,id DESC LIMIT $3`, [userId, seasonId, MAX_SAVED]);
  return result.rows.map(row => view(row, false));
}
async function owned(client, userId, id, lock = false) {
  const result = await client.query(`SELECT ${FIELDS} FROM tierlists.saved_tierlists WHERE id=$1 AND user_id=$2${lock ? ' FOR UPDATE' : ''}`, [id, userId]);
  return result.rows[0] ? view(result.rows[0]) : null;
}
async function create(client, userId, value) {
  // Caller supplies a transaction; lock only the service's per-account capacity.
  await client.query('SELECT pg_advisory_xact_lock(918728,$1::INTEGER)', [userId]);
  const count = Number((await client.query('SELECT count(*) AS count FROM tierlists.saved_tierlists WHERE user_id=$1', [userId])).rows[0].count);
  if (count >= MAX_SAVED) throw new HttpError(409, 'Сохранено 100 тирлистов. Удалите ненужный перед созданием нового.');
  const result = await client.query(`INSERT INTO tierlists.saved_tierlists(id,user_id,title,season_id,rankings)
    VALUES($1,$2,$3,$4,$5::JSONB) RETURNING ${FIELDS}`,
  [randomUUID(), userId, value.title, value.seasonId, JSON.stringify(value.rows)]);
  return view(result.rows[0]);
}
async function update(client, userId, id, value) {
  const result = await client.query(`UPDATE tierlists.saved_tierlists SET title=$3,season_id=$4,rankings=$5::JSONB,
    revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND user_id=$2 AND revision=$6 RETURNING ${FIELDS}`,
  [id, userId, value.title, value.seasonId, JSON.stringify(value.rows), value.revision]);
  return result.rows[0] ? view(result.rows[0]) : null;
}
async function remove(client, userId, id, revision) {
  return (await client.query('DELETE FROM tierlists.saved_tierlists WHERE id=$1 AND user_id=$2 AND revision=$3', [id, userId, revision])).rowCount > 0;
}
module.exports = { view, seasons, hasSeason, list, owned, create, update, remove };
