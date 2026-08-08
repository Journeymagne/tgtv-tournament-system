const { GAME_COLUMNS: COLUMNS, mapGame } = require("../rows");

// Единственное объявление набора активных статусов. src/api/games.js импортирует его отсюда.
const ACTIVE_STATUSES = ["open", "pending_confirmation"];

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM games WHERE id = $1`, [id]);
  return mapGame(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapGame(rows[0]);
}

async function listCompleted(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE status = 'completed'
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`
  );
  return rows.map(mapGame);
}

async function listCompletedForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'completed' AND $1 = ANY(player_ids)
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [userId]
  );
  return rows.map(mapGame);
}

async function listCompletedForRatingReplay(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'completed' AND result IS NOT NULL
     ORDER BY COALESCE(submitted_at, created_at), id
     FOR UPDATE`
  );
  return rows.map(mapGame);
}

async function listForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE $1 = ANY(player_ids)
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.map(mapGame);
}

async function listActive(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = ANY($1::text[]) AND source_type = 'challenge'
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [ACTIVE_STATUSES]
  );
  return rows.map(mapGame);
}

async function listPendingForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'pending_confirmation' AND source_type = 'challenge' AND $1 = ANY(player_ids)
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [userId]
  );
  return rows.map(mapGame);
}

async function findActiveBetween(client, userId, otherUserId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = ANY($3::text[]) AND source_type = 'challenge'
       AND $1 = ANY(player_ids) AND $2 = ANY(player_ids)
     LIMIT 1`,
    [userId, otherUserId, ACTIVE_STATUSES]
  );
  return mapGame(rows[0]);
}

async function insert(client, { challengeId, playerIds, sourceType = "challenge", sourceId = null }) {
  const { rows } = await client.query(
    `INSERT INTO games (challenge_id, player_ids, status, source_type, source_id)
     VALUES ($1, $2, 'open', $3, $4) RETURNING ${COLUMNS}`,
    [challengeId || null, playerIds, sourceType, sourceId]
  );
  return mapGame(rows[0]);
}

async function savePendingResult(client, id, { submittedBy, pendingResult }) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'pending_confirmation',
         submitted_by = $2,
         submitted_at = NOW(),
         pending_result = $3::jsonb,
         result = NULL,
         elo = NULL
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, submittedBy, JSON.stringify(pendingResult)]
  );
  return mapGame(rows[0]);
}

async function clearResult(client, id) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'open', submitted_by = NULL, submitted_at = NULL,
         pending_result = NULL, result = NULL, elo = NULL
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id]
  );
  return mapGame(rows[0]);
}

// `newSubmission` distinguishes a fresh submission (admin override) from a
// confirmation of an existing one (normal player flow): the former bumps
// submitted_at to now, the latter preserves whatever was already recorded.
async function saveFinalResult(client, id, { result, elo, submittedBy = null, newSubmission = false }) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'completed',
         result = $2::jsonb,
         elo = $3::jsonb,
         pending_result = NULL,
         submitted_by = COALESCE($4, submitted_by),
         submitted_at = CASE WHEN $5 THEN NOW() ELSE COALESCE(submitted_at, NOW()) END
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, JSON.stringify(result), JSON.stringify(elo), submittedBy, newSubmission]
  );
  return mapGame(rows[0]);
}

async function updateElo(client, id, elo) {
  const { rows } = await client.query(
    `UPDATE games SET elo = $2::jsonb WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, JSON.stringify(elo || null)]
  );
  return mapGame(rows[0]);
}

async function cancel(client, id) {
  const { rows } = await client.query(
    `UPDATE games
     SET status = 'cancelled', submitted_by = NULL, submitted_at = NULL,
         pending_result = NULL, result = NULL, elo = NULL
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id]
  );
  return mapGame(rows[0]);
}

module.exports = {
  ACTIVE_STATUSES,
  findById,
  lockById,
  listCompleted,
  listCompletedForUser,
  listCompletedForRatingReplay,
  listForUser,
  listActive,
  listPendingForUser,
  findActiveBetween,
  insert,
  savePendingResult,
  clearResult,
  saveFinalResult,
  updateElo,
  cancel
};
