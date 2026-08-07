const { USER_COLUMNS: COLUMNS, mapUser } = require("../rows");

function nameKeyOf(name) {
  return String(name || "").toLowerCase();
}

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return mapUser(rows[0]);
}

async function findByIds(client, ids) {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id));
  if (!unique.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
    [unique]
  );
  return rows.map(mapUser);
}

async function lockByIds(client, ids) {
  const ordered = [...new Set(ids)].filter((id) => Number.isInteger(id)).sort((a, b) => a - b);
  if (!ordered.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
    [ordered]
  );
  return rows.map(mapUser);
}

async function findByNameKey(client, nameKey) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE name_key = $1`,
    [nameKeyOf(nameKey)]
  );
  return mapUser(rows[0]);
}

async function isNameTaken(client, name, excludeId = null) {
  const { rows } = await client.query(
    `SELECT 1 FROM users WHERE name_key = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
    [nameKeyOf(name), excludeId]
  );
  return rows.length > 0;
}

async function listLeaderboard(client) {
  const { rows } = await client.query(
    `SELECT id, name, avatar_data, rating, is_admin
     FROM users ORDER BY rating DESC, name ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarData: row.avatar_data || null,
    rating: row.rating,
    isAdmin: row.is_admin
  }));
}

async function listWithGameCounts(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*)::int FROM games
              WHERE games.status = 'completed' AND users.id = ANY(games.player_ids)) AS games_played
     FROM users ORDER BY rating DESC, name ASC`
  );
  return rows.map((row) => ({ ...mapUser(row), gamesPlayed: row.games_played }));
}

async function listForRatingReplay(client) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM users ORDER BY id FOR UPDATE`);
  return rows.map(mapUser);
}

// Escapes LIKE metacharacters (\, %, _) so a search term is matched as a
// literal substring, matching the plain `.includes()` semantics of the
// legacy in-memory search this repository replaces.
function escapeLikeTerm(term) {
  return term.replace(/([\\%_])/g, "\\$1");
}

async function search(client, { q, excludeId, limit = 10 }) {
  const term = escapeLikeTerm(String(q || "").toLowerCase());
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users
     WHERE ($1::int IS NULL OR id <> $1)
       AND ($2 = '' OR name_key LIKE '%' || $2 || '%' ESCAPE '\\'
            OR LOWER(COALESCE(register_nickname, '')) LIKE '%' || $2 || '%' ESCAPE '\\'
            OR LOWER(COALESCE(telegram_contact, '')) LIKE '%' || $2 || '%' ESCAPE '\\')
     ORDER BY rating DESC, name ASC
     LIMIT $3`,
    [excludeId, term, limit]
  );
  return rows.map(mapUser);
}

async function insert(client, user) {
  const { rows } = await client.query(
    `INSERT INTO users
       (name, name_key, password_hash, avatar_data, register_nickname,
        telegram_contact, challenge_credits, rating, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      user.name,
      nameKeyOf(user.name),
      user.passwordHash,
      user.avatarData || null,
      user.registerNickname || null,
      user.telegramContact || null,
      JSON.stringify(user.challengeCredits || []),
      user.rating,
      Boolean(user.isAdmin)
    ]
  );
  return mapUser(rows[0]);
}

const PROFILE_COLUMNS = {
  name: "name",
  avatarData: "avatar_data",
  registerNickname: "register_nickname",
  telegramContact: "telegram_contact"
};

async function updateProfile(client, id, patch) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(PROFILE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(patch[field]);
    assignments.push(`${column} = $${values.length}`);
    if (field === "name") {
      values.push(nameKeyOf(patch.name));
      assignments.push(`name_key = $${values.length}`);
    }
  }
  if (!assignments.length) return findById(client, id);

  const { rows } = await client.query(
    `UPDATE users SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    values
  );
  return mapUser(rows[0]);
}

async function setPasswordHash(client, id, passwordHash) {
  const { rows } = await client.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, passwordHash]
  );
  return mapUser(rows[0]);
}

async function addRating(client, id, delta) {
  const { rows } = await client.query(
    `UPDATE users SET rating = rating + $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, delta]
  );
  return mapUser(rows[0]);
}

async function setRating(client, id, rating) {
  const { rows } = await client.query(
    `UPDATE users SET rating = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, rating]
  );
  return mapUser(rows[0]);
}

async function setAdmin(client, id, isAdmin) {
  const { rows } = await client.query(
    `UPDATE users SET is_admin = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, Boolean(isAdmin)]
  );
  return mapUser(rows[0]);
}

async function appendChallengeCredit(client, id, credit) {
  const { rows } = await client.query(
    `UPDATE users
     SET challenge_credits = COALESCE(challenge_credits, '[]'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, JSON.stringify([credit])]
  );
  return mapUser(rows[0]);
}

async function remove(client, id) {
  await client.query("DELETE FROM games WHERE $1 = ANY(player_ids)", [id]);
  await client.query("DELETE FROM users WHERE id = $1", [id]);
}

async function countAdmins(client) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE is_admin");
  return rows[0].count;
}

async function hasAdmin(client) {
  return (await countAdmins(client)) > 0;
}

module.exports = {
  findById,
  findByIds,
  lockByIds,
  findByNameKey,
  isNameTaken,
  listLeaderboard,
  listWithGameCounts,
  listForRatingReplay,
  search,
  insert,
  updateProfile,
  setPasswordHash,
  addRating,
  setRating,
  setAdmin,
  appendChallengeCredit,
  remove,
  countAdmins,
  hasAdmin
};
const { USER_COLUMNS: COLUMNS, mapUser } = require("../rows");

function nameKeyOf(name) {
  return String(name || "").toLowerCase();
}

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
  return mapUser(rows[0]);
}

async function findByIds(client, ids) {
  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id));
  if (!unique.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
    [unique]
  );
  return rows.map(mapUser);
}

async function lockByIds(client, ids) {
  const ordered = [...new Set(ids)].filter((id) => Number.isInteger(id)).sort((a, b) => a - b);
  if (!ordered.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
    [ordered]
  );
  return rows.map(mapUser);
}

async function findByNameKey(client, nameKey) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users WHERE name_key = $1`,
    [nameKeyOf(nameKey)]
  );
  return mapUser(rows[0]);
}

async function isNameTaken(client, name, excludeId = null) {
  const { rows } = await client.query(
    `SELECT 1 FROM users WHERE name_key = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
    [nameKeyOf(name), excludeId]
  );
  return rows.length > 0;
}

async function listLeaderboard(client) {
  const { rows } = await client.query(
    `SELECT id, name, avatar_data, rating, is_admin
     FROM users ORDER BY rating DESC, name ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    avatarData: row.avatar_data || null,
    rating: row.rating,
    isAdmin: row.is_admin
  }));
}

async function listWithGameCounts(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS},
            (SELECT COUNT(*)::int FROM games
              WHERE games.status = 'completed' AND users.id = ANY(games.player_ids)) AS games_played
     FROM users ORDER BY rating DESC, name ASC`
  );
  return rows.map((row) => ({ ...mapUser(row), gamesPlayed: row.games_played }));
}

// Escapes LIKE metacharacters (\, %, _) so a search term is matched as a
// literal substring, matching the plain `.includes()` semantics of the
// legacy in-memory search this repository replaces.
function escapeLikeTerm(term) {
  return term.replace(/([\\%_])/g, "\\$1");
}

async function search(client, { q, excludeId, limit = 10 }) {
  const term = escapeLikeTerm(String(q || "").toLowerCase());
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM users
     WHERE ($1::int IS NULL OR id <> $1)
       AND ($2 = '' OR name_key LIKE '%' || $2 || '%' ESCAPE '\\'
            OR LOWER(COALESCE(register_nickname, '')) LIKE '%' || $2 || '%' ESCAPE '\\'
            OR LOWER(COALESCE(telegram_contact, '')) LIKE '%' || $2 || '%' ESCAPE '\\')
     ORDER BY rating DESC, name ASC
     LIMIT $3`,
    [excludeId, term, limit]
  );
  return rows.map(mapUser);
}

async function insert(client, user) {
  const { rows } = await client.query(
    `INSERT INTO users
       (name, name_key, password_hash, avatar_data, register_nickname,
        telegram_contact, challenge_credits, rating, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      user.name,
      nameKeyOf(user.name),
      user.passwordHash,
      user.avatarData || null,
      user.registerNickname || null,
      user.telegramContact || null,
      JSON.stringify(user.challengeCredits || []),
      user.rating,
      Boolean(user.isAdmin)
    ]
  );
  return mapUser(rows[0]);
}

const PROFILE_COLUMNS = {
  name: "name",
  avatarData: "avatar_data",
  registerNickname: "register_nickname",
  telegramContact: "telegram_contact"
};

async function updateProfile(client, id, patch) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(PROFILE_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(patch[field]);
    assignments.push(`${column} = $${values.length}`);
    if (field === "name") {
      values.push(nameKeyOf(patch.name));
      assignments.push(`name_key = $${values.length}`);
    }
  }
  if (!assignments.length) return findById(client, id);

  const { rows } = await client.query(
    `UPDATE users SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    values
  );
  return mapUser(rows[0]);
}

async function setPasswordHash(client, id, passwordHash) {
  const { rows } = await client.query(
    `UPDATE users SET password_hash = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, passwordHash]
  );
  return mapUser(rows[0]);
}

async function addRating(client, id, delta) {
  const { rows } = await client.query(
    `UPDATE users SET rating = rating + $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, delta]
  );
  return mapUser(rows[0]);
}

async function setRating(client, id, rating) {
  const { rows } = await client.query(
    `UPDATE users SET rating = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, rating]
  );
  return mapUser(rows[0]);
}

async function setAdmin(client, id, isAdmin) {
  const { rows } = await client.query(
    `UPDATE users SET is_admin = $2, updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, Boolean(isAdmin)]
  );
  return mapUser(rows[0]);
}

async function appendChallengeCredit(client, id, credit) {
  const { rows } = await client.query(
    `UPDATE users
     SET challenge_credits = COALESCE(challenge_credits, '[]'::jsonb) || $2::jsonb,
         updated_at = NOW()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, JSON.stringify([credit])]
  );
  return mapUser(rows[0]);
}

async function remove(client, id) {
  await client.query("DELETE FROM games WHERE $1 = ANY(player_ids)", [id]);
  await client.query("DELETE FROM users WHERE id = $1", [id]);
}

async function countAdmins(client) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE is_admin");
  return rows[0].count;
}

async function hasAdmin(client) {
  return (await countAdmins(client)) > 0;
}

module.exports = {
  findById,
  findByIds,
  lockByIds,
  findByNameKey,
  isNameTaken,
  listLeaderboard,
  listWithGameCounts,
  search,
  insert,
  updateProfile,
  setPasswordHash,
  addRating,
  setRating,
  setAdmin,
  appendChallengeCredit,
  remove,
  countAdmins,
  hasAdmin
};
