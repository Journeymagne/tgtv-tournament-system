const { GAME_COLUMNS: COLUMNS, mapGame } = require("../rows");
const gameParticipantsRepo = require("./game-participants");

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

async function listCompleted(client, venueMode = null) {
  const venue = ["tts", "irl"].includes(venueMode) ? venueMode : null;
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'completed' AND ($1::text IS NULL OR venue_mode = $1)
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [venue]
  );
  return rows.map(mapGame);
}

async function listCompletedForUser(client, userId, venueMode = null) {
  const venue = ["tts", "irl"].includes(venueMode) ? venueMode : null;
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'completed' AND $1 = ANY(player_ids)
       AND ($2::text IS NULL OR venue_mode = $2)
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [userId, venue]
  );
  return rows.map(mapGame);
}

// Match the names shown by gameView, including tournament guests and snapshots.
const PARTICIPANT_NAME = `CASE WHEN g.source_type = 'team_match_game'
  THEN gp.display_name_snapshot ELSE COALESCE(u.name, gp.display_name_snapshot) END`;

function playerSearchSql(query, values) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return "TRUE";
  values.push(raw);
  const conditions = [`strpos(lower(${PARTICIPANT_NAME}), $${values.length}) > 0`];
  const compact = raw.normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  if (compact) {
    values.push(compact);
    conditions.push(`strpos(regexp_replace(lower(normalize(${PARTICIPANT_NAME}, NFKC)), '[^[:alnum:]]', '', 'g'), $${values.length}) > 0`);
  }
  return `(${conditions.join(" OR ")})`;
}

async function listCompletedPage(client, { page, venue, playerId, playerQuery, factionKeys }) {
  const pageSize = 25;
  const values = [venue];
  const base = `g.status = 'completed' AND ($1::text IS NULL OR g.venue_mode = $1)`;
  const filters = [];
  if (playerId || playerQuery) {
    let playerCondition;
    if (playerId) {
      values.push(playerId);
      playerCondition = `gp.result_key = $${values.length}`;
    } else {
      playerCondition = playerSearchSql(playerQuery, values);
    }
    filters.push(`EXISTS (
      SELECT 1 FROM game_participants gp LEFT JOIN users u ON u.id = gp.user_id
      WHERE gp.game_id = g.id AND ${playerCondition}
    )`);
  }
  if (factionKeys.length) {
    values.push(factionKeys);
    filters.push(`EXISTS (
      SELECT 1 FROM jsonb_each(COALESCE(g.result->'scores', '{}'::jsonb)) score
      WHERE trim(regexp_replace(replace(replace(lower(COALESCE(
        NULLIF(score.value->>'faction', ''), NULLIF(score.value->>'killTeam', ''), score.value->>'team', ''
      )), chr(39), ''), chr(96), ''), '[^a-z0-9]+', ' ', 'g')) = ANY($${values.length}::text[])
    )`);
  }
  const filter = filters.join(" AND ") || "TRUE";
  const { rows: counts } = await client.query(
    `SELECT COUNT(*)::int AS total_completed, COUNT(*) FILTER (WHERE ${filter})::int AS total
     FROM games g WHERE ${base}`, values
  );
  const total = counts[0].total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games g WHERE ${base} AND ${filter}
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, start]
  );
  return {
    games: rows.map(mapGame),
    totalCompleted: counts[0].total_completed,
    pagination: { currentPage, totalPages, total, pageSize, start, end: start + rows.length }
  };
}

async function completedPlayerSuggestions(client, { venue, playerQuery }) {
  const values = [venue];
  const search = playerSearchSql(playerQuery, values);
  values.push(String(playerQuery || "").trim().toLowerCase());
  const { rows } = await client.query(
    `SELECT gp.result_key AS id,
       (array_agg(${PARTICIPANT_NAME} ORDER BY COALESCE(g.submitted_at, g.created_at) DESC, g.id DESC))[1] AS name,
       COUNT(DISTINCT g.id)::int AS games
     FROM games g JOIN game_participants gp ON gp.game_id = g.id
     LEFT JOIN users u ON u.id = gp.user_id
     WHERE g.status = 'completed' AND ($1::text IS NULL OR g.venue_mode = $1)
       AND gp.result_key > 0 AND ${search}
     GROUP BY gp.result_key
     ORDER BY bool_or(strpos(lower(${PARTICIPANT_NAME}), $${values.length}) = 1) DESC,
       games DESC, name, id
     LIMIT 8`, values
  );
  return rows;
}

// Rating migrations run before migration 044 adds is_proxy. Read that optional
// field through the row JSON so legacy schemas and current proxy games both work.
async function listCompletedForRatingReplay(client) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'completed' AND result IS NOT NULL
     ORDER BY COALESCE(submitted_at, created_at), id
     FOR UPDATE`
  );
  const { rows: participants } = await client.query(
    `SELECT gp.game_id, gp.user_id, gp.result_key,
       COALESCE((to_jsonb(gp)->>'is_proxy')::boolean, FALSE) AS is_proxy
     FROM game_participants gp JOIN games g ON g.id = gp.game_id
     WHERE g.status = 'completed' AND g.result IS NOT NULL
     ORDER BY gp.game_id, gp.slot`
  );
  const byGame = new Map();
  for (const p of participants) {
    if (!byGame.has(p.game_id)) byGame.set(p.game_id, []);
    byGame.get(p.game_id).push({ userId: p.user_id, resultKey: p.result_key, isProxy: Boolean(p.is_proxy) });
  }
  return rows.map((row) => ({ ...mapGame(row), ratingParticipants: byGame.get(row.id) || [] }));
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
     WHERE status = ANY($1::text[])
     ORDER BY COALESCE(submitted_at, created_at) DESC, id DESC`,
    [ACTIVE_STATUSES]
  );
  return rows.map(mapGame);
}

async function listPendingForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games
     WHERE status = 'pending_confirmation' AND $1 = ANY(player_ids)
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

async function insert(
  client,
  { challengeId, playerIds, sourceType = "challenge", sourceId = null, venueMode = "tts", participants = null }
) {
  const venue = venueMode === "irl" ? "irl" : "tts";
  const { rows } = await client.query(
    `INSERT INTO games (challenge_id, player_ids, status, source_type, source_id, venue_mode)
     VALUES ($1, $2, 'open', $3, $4, $5) RETURNING ${COLUMNS}`,
    [challengeId || null, playerIds, sourceType, sourceId, venue]
  );
  const game = mapGame(rows[0]);
  if (Array.isArray(participants) && participants.length) {
    await gameParticipantsRepo.replaceForGame(client, game.id, participants);
  } else {
    await gameParticipantsRepo.replaceFromUserIds(client, game.id, playerIds);
  }
  return game;
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

async function listByIds(client, ids) {
  const gameIds = [...new Set(ids)].filter(Number.isInteger);
  if (!gameIds.length) return [];
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM games WHERE id = ANY($1::int[]) ORDER BY id`,
    [gameIds]
  );
  return rows.map(mapGame);
}

async function removeBySourceIds(client, sourceType, sourceIds) {
  const ids = [...new Set(sourceIds)].filter((id) => Number.isInteger(id));
  if (!ids.length) return [];
  const { rows } = await client.query(
    `DELETE FROM games
     WHERE source_type = $1 AND source_id = ANY($2::int[])
     RETURNING ${COLUMNS}`,
    [sourceType, ids]
  );
  return rows.map(mapGame);
}

module.exports = {
  ACTIVE_STATUSES,
  findById,
  listByIds,
  lockById,
  listCompleted,
  listCompletedPage,
  completedPlayerSuggestions,
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
  cancel,
  removeBySourceIds
};
