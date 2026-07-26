const { mapUser } = require("../rows");

const USER_COLUMNS = `
  u.id, u.name, u.name_key, u.password_hash, u.avatar_data, u.register_nickname,
  u.telegram_contact, u.challenge_credits, u.rating, u.is_admin, u.created_at, u.updated_at
`;

async function create(client, { token, userId, expiresAt }) {
  await client.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );
  return token;
}

async function findActiveUser(client, token) {
  if (!token) return null;
  const { rows } = await client.query(
    `SELECT ${USER_COLUMNS}
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return mapUser(rows[0]);
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

module.exports = { create, findActiveUser, deleteByToken, deleteByUserId, deleteExpired };
