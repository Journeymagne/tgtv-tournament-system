const { USER_COLUMNS, mapUser, aliasColumns } = require("../rows");

const JOINED_USER_COLUMNS = aliasColumns(USER_COLUMNS, "u");

async function create(client, { token, userId, expiresAt }) {
  await client.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

async function findActiveSession(client, token) {
  if (!token) return null;
  const { rows } = await client.query(
    `SELECT ${JOINED_USER_COLUMNS}, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;
  return { user: mapUser(row), expiresAt: row.expires_at };
}

async function findActiveUser(client, token) {
  const session = await findActiveSession(client, token);
  return session ? session.user : null;
}

async function extend(client, token, expiresAt) {
  if (!token) return;
  await client.query("UPDATE sessions SET expires_at = $2 WHERE token = $1", [token, expiresAt]);
}

async function deleteByToken(client, token) {
  if (!token) return;
  await client.query("DELETE FROM sessions WHERE token = $1", [token]);
}

async function deleteByUserId(client, userId) {
  await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

async function deleteExpired(client) {
  await client.query("DELETE FROM sessions WHERE expires_at <= NOW()");
}

module.exports = {
  create,
  findActiveSession,
  findActiveUser,
  extend,
  deleteByToken,
  deleteByUserId,
  deleteExpired
};
