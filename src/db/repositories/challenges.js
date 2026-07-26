const { CHALLENGE_COLUMNS: COLUMNS, mapChallenge } = require("../rows");

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM challenges WHERE id = $1`, [id]);
  return mapChallenge(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapChallenge(rows[0]);
}

async function findByShareToken(client, token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!/^[a-f0-9]{36}$/.test(normalized)) return null;
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges WHERE share_token = $1 FOR UPDATE`,
    [normalized]
  );
  return mapChallenge(rows[0]);
}

async function findPendingBetween(client, userId, otherUserId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges
     WHERE status = 'pending'
       AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
     LIMIT 1`,
    [userId, otherUserId]
  );
  return mapChallenge(rows[0]);
}

async function listForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM challenges
     WHERE from_user_id = $1 OR to_user_id = $1
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.map(mapChallenge);
}

async function insert(client, { fromUserId, toUserId, shareToken }) {
  const { rows } = await client.query(
    `INSERT INTO challenges (from_user_id, to_user_id, status, share_token)
     VALUES ($1, $2, 'pending', $3)
     RETURNING ${COLUMNS}`,
    [fromUserId, toUserId, shareToken]
  );
  return mapChallenge(rows[0]);
}

async function setStatus(client, id, status) {
  const { rows } = await client.query(
    `UPDATE challenges SET status = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, status]
  );
  return mapChallenge(rows[0]);
}

async function attachGame(client, id, gameId) {
  const { rows } = await client.query(
    `UPDATE challenges SET game_id = $2, status = 'accepted', updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, gameId]
  );
  return mapChallenge(rows[0]);
}

module.exports = {
  findById,
  lockById,
  findByShareToken,
  findPendingBetween,
  listForUser,
  insert,
  setStatus,
  attachGame
};
