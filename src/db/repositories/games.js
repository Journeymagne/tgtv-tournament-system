const { GAME_COLUMNS: COLUMNS, mapGame } = require("../rows");
const gameParticipantsRepo = require("./game-participants");

// Единственное объявление набора активных статусов. src/api/games.js импортирует его отсюда.
const ACTIVE_STATUSES = ["open", "pending_confirmation"];

// The global game browser and aggregate statistics expose the same published
// tournament results, including team-game links whose source_id is not an event.
function publishedGameSql() {
  const statuses = require('./tournaments').PUBLISHED_STATUSES.map(value => `'${value}'`).join(',');
  return `(g.source_type NOT IN ('tournament_match', 'team_match_game') OR
    (g.source_type = 'tournament_match' AND EXISTS (
      SELECT 1 FROM tournament_matches visible_match JOIN tournaments visible_event ON visible_event.id = visible_match.tournament_id
      WHERE visible_match.game_id = g.id AND visible_event.status IN (${statuses})
    )) OR (g.source_type = 'team_match_game' AND EXISTS (
      SELECT 1 FROM tournament_team_match_games visible_link
      JOIN tournament_team_matches visible_match ON visible_match.id = visible_link.team_match_id
      JOIN tournaments visible_event ON visible_event.id = visible_match.tournament_id
      WHERE visible_link.game_id = g.id AND visible_event.status IN (${statuses})
    )))`;
}

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
    `SELECT ${COLUMNS} FROM games g
     WHERE status = 'completed' AND ($1::text IS NULL OR venue_mode = $1) AND ${publishedGameSql()}
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

async function listPublishedCompletedForUser(client, userId) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM games g
    WHERE g.status='completed' AND g.result IS NOT NULL AND ${publishedGameSql()}
      AND EXISTS (SELECT 1 FROM game_participants gp WHERE gp.game_id=g.id
        AND gp.user_id=$1 AND NOT gp.is_proxy)
    ORDER BY COALESCE(g.submitted_at,g.created_at) DESC, g.id DESC`, [userId]);
  return rows.map(mapGame);
}

// Match the names shown by gameView, including tournament guests and snapshots.
const PARTICIPANT_NAME = `CASE WHEN g.source_type = 'team_match_game'
  THEN gp.display_name_snapshot ELSE COALESCE(u.name, gp.display_name_snapshot) END`;

function numericSql(expression) {
  return `(CASE WHEN (${expression}) ~ '^-?[0-9]+([.][0-9]+)?$' THEN (${expression})::numeric END)`;
}

function completedOrderBy(sort, direction) {
  const side = (slot, expression, joins = '') => `(SELECT ${expression} FROM game_participants gp
    LEFT JOIN users u ON u.id = gp.user_id ${joins} WHERE gp.game_id = g.id AND gp.slot = ${slot})`;
  const score = slot => side(slot, numericSql("g.result->'scores'->(gp.result_key::text)->>'total'"));
  const metadata = (expression, teamOnly = false) => `(CASE
    ${teamOnly ? '' : `WHEN g.source_type = 'tournament_match' THEN (
      SELECT ${expression} FROM tournament_matches sort_match
      JOIN tournaments sort_event ON sort_event.id = sort_match.tournament_id WHERE sort_match.game_id = g.id)`}
    WHEN g.source_type = 'team_match_game' THEN (
      SELECT ${expression} FROM tournament_team_match_games sort_link
      JOIN tournament_team_matches sort_match ON sort_match.id = sort_link.team_match_id
      JOIN tournaments sort_event ON sort_event.id = sort_match.tournament_id
      JOIN tournament_team_rosters sort_roster_a ON sort_roster_a.id = sort_match.roster_a_id
      JOIN tournament_team_rosters sort_roster_b ON sort_roster_b.id = sort_match.roster_b_id
      WHERE sort_link.game_id = g.id) END)`;
  const factionJoins = `LEFT JOIN tournament_team_match_games faction_link ON faction_link.game_id = gp.game_id
    LEFT JOIN tournament_team_roster_members faction_a ON faction_a.id = faction_link.roster_a_member_id
    LEFT JOIN tournament_team_roster_members faction_b ON faction_b.id = faction_link.roster_b_member_id`;
  const legacyFaction = `CASE WHEN NOT gp.is_proxy THEN
    CASE WHEN gp.slot = 1 AND gp.user_id = faction_a.user_id THEN faction_a.faction_snapshot
         WHEN gp.slot = 2 AND gp.user_id = faction_b.user_id THEN faction_b.faction_snapshot END END`;
  const columns = {
    date: 'COALESCE(g.submitted_at, g.created_at)', player: side(1, PARTICIPANT_NAME), opponent: side(2, PARTICIPANT_NAME),
    faction: side(1, `COALESCE(NULLIF(g.result->'scores'->(gp.result_key::text)->>'faction', ''), NULLIF(g.result->'scores'->(gp.result_key::text)->>'killTeam', ''), NULLIF(g.result->'scores'->(gp.result_key::text)->>'team', ''), NULLIF(gp.faction_snapshot, ''), NULLIF(${legacyFaction}, ''))`, factionJoins),
    score: score(1), opponentScore: score(2), vpDiff: `(${score(1)} - ${score(2)})`,
    elo: side(1, numericSql("g.elo->(gp.result_key::text)->>'delta'")),
    tournament: metadata('sort_event.name'), round: metadata('sort_match.round_number'), status: 'g.status',
    rosterA: metadata('sort_roster_a.name', true), rosterB: metadata('sort_roster_b.name', true)
  };
  return require('../../domain/statistics-sorting').sqlOrder(columns, sort, direction,
    'COALESCE(g.submitted_at, g.created_at) DESC, g.id DESC', 'g.id DESC');
}

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

async function listCompletedPage(client, { page, venue, playerId, playerQuery, factionKeys = [], sort, direction }) {
  const pageSize = 25;
  const values = [venue];
  const base = `g.status = 'completed' AND ($1::text IS NULL OR g.venue_mode = $1) AND ${publishedGameSql()}`;
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
     ORDER BY ${completedOrderBy(sort, direction)}
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
       AND ${publishedGameSql()} AND gp.result_key > 0 AND ${search}
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
  { challengeId, playerIds, sourceType = "challenge", sourceId = null, sourceSlot = 0, venueMode = "tts", participants = null }
) {
  const venue = venueMode === "irl" ? "irl" : "tts";
  const { rows } = await client.query(
    `INSERT INTO games (challenge_id, player_ids, status, source_type, source_id, venue_mode, source_slot)
     VALUES ($1, $2, 'open', $3, $4, $5, $6) RETURNING ${COLUMNS}`,
    [challengeId || null, playerIds, sourceType, sourceId ?? (sourceType === "challenge" ? challengeId || null : null), venue, sourceSlot]
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
  completedOrderBy,
  ACTIVE_STATUSES,
  findById,
  listByIds,
  lockById,
  listCompleted,
  listCompletedPage,
  completedPlayerSuggestions,
  listCompletedForUser,
  listPublishedCompletedForUser,
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
