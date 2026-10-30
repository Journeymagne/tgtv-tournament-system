const {
  TOURNAMENT_COLUMNS,
  TOURNAMENT_PARTICIPANT_COLUMNS,
  TOURNAMENT_MATCH_COLUMNS: COLUMNS,
  TOURNAMENT_TABLE_COLUMNS,
  aliasColumns,
  mapTournament,
  mapTournamentParticipant,
  mapTournamentMatch,
  mapTournamentTable
} = require("../rows");

const RESULT_FIELDS = { pendingResult: 'pending_result', result: 'result', elo: 'elo', submittedByUserId: 'submitted_by' };
const FIELDS = {
  tournamentId: 'tournament_id', roundId: 'round_id', roundNumber: 'round_number',
  bracketPosition: 'bracket_position', status: 'status', isBye: 'is_bye',
  participantSnapshots: 'participant_snapshots', participantAId: 'participant_a_id', participantBId: 'participant_b_id',
  sourceMatchAId: 'source_match_a_id', sourceMatchBId: 'source_match_b_id', winnerParticipantId: 'winner_participant_id',
  pendingResult: 'pending_result', result: 'result', matchPoints: 'match_points', elo: 'elo', gameId: 'game_id',
  submittedByUserId: 'submitted_by_user_id', tableId: 'table_id', mission: 'mission', completedAt: 'completed_at'
};
const JSON_FIELDS = new Set(['participantSnapshots', 'pendingResult', 'result', 'matchPoints', 'elo', 'mission']);

// Historical migrations 034/047 call this repository before normalization.
// Inspect the schema instead of caching a flag that becomes stale mid-migration.
async function readRelation(client) {
  const { rows } = await client.query("SELECT to_regclass('tournaments.tournament_match_results') IS NOT NULL AS normalized");
  return rows[0].normalized ? 'tournament_match_results' : 'tournament_matches';
}

function storedFields(value, normalized) {
  return Object.entries(FIELDS).filter(([field]) => Object.hasOwn(value, field) &&
    (!normalized || !Object.hasOwn(RESULT_FIELDS, field)));
}

async function insert(client, match) {
  const relation = await readRelation(client);
  const normalized = relation !== 'tournament_matches';
  // A result-bearing import first creates its metadata in a non-final state.
  const initial = normalized && match.status === 'completed' && !match.isBye
    ? { ...match, status: 'active', winnerParticipantId: null, gameId: null } : match;
  const entries = storedFields(initial, normalized);
  const { rows } = await client.query(
    `INSERT INTO tournament_matches (${entries.map(([, column]) => column).join(', ')})
     VALUES (${entries.map(([field], i) => `$${i + 1}${JSON_FIELDS.has(field) ? '::jsonb' : ''}`).join(', ')}) RETURNING id`,
    entries.map(([field]) => JSON_FIELDS.has(field) ? JSON.stringify(initial[field] ?? null) : initial[field])
  );
  if (normalized && Object.keys(RESULT_FIELDS).some(field => Object.hasOwn(match, field) && match[field] != null)) {
    return update(client, rows[0].id, match);
  }
  // No result is required for a bye; playable completed imports must supply one.
  if (initial !== match) return update(client, rows[0].id, {
    status: match.status, winnerParticipantId: match.winnerParticipantId, gameId: match.gameId ?? null
  });
  return findById(client, rows[0].id);
}

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM ${await readRelation(client)} WHERE id = $1`, [
    id
  ]);
  return mapTournamentMatch(rows[0]);
}

async function lockById(client, id) {
  await client.query('SELECT id FROM tournament_matches WHERE id=$1 FOR UPDATE', [id]);
  return findById(client, id);
}

async function listByTournament(client, tournamentId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM ${await readRelation(client)}
     WHERE tournament_id = $1
     ORDER BY round_number, COALESCE(bracket_position, id), id`,
    [tournamentId]
  );
  return rows.map(mapTournamentMatch);
}

async function listByRound(client, roundId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM ${await readRelation(client)}
     WHERE round_id = $1
     ORDER BY COALESCE(bracket_position, id), id`,
    [roundId]
  );
  return rows.map(mapTournamentMatch);
}

async function listActiveForUser(client, userId) {
  const { rows } = await client.query(
    `SELECT
        row_to_json(tournament_row) AS tournament,
        row_to_json(match_row) AS match,
        row_to_json(participant_a_row) AS participant_a,
        row_to_json(participant_b_row) AS participant_b,
        row_to_json(table_row) AS tournament_table
     FROM ${await readRelation(client)} tm
     JOIN tournaments t ON t.id = tm.tournament_id
     JOIN tournament_participants pa ON pa.id = tm.participant_a_id
     JOIN tournament_participants pb ON pb.id = tm.participant_b_id
     LEFT JOIN tournament_tables tt ON tt.id = tm.table_id
     CROSS JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_COLUMNS, "t")}) tournament_row
     CROSS JOIN LATERAL (SELECT ${aliasColumns(COLUMNS, "tm")}) match_row
     CROSS JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_PARTICIPANT_COLUMNS, "pa")}) participant_a_row
     CROSS JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_PARTICIPANT_COLUMNS, "pb")}) participant_b_row
     LEFT JOIN LATERAL (SELECT ${aliasColumns(TOURNAMENT_TABLE_COLUMNS, "tt")}) table_row ON tt.id IS NOT NULL
     WHERE t.status = 'in_progress'
       AND tm.status = ANY($2::text[])
       AND tm.is_bye = FALSE
       AND ((CASE WHEN tm.participant_snapshots ? pa.id::text THEN (tm.participant_snapshots -> pa.id::text ->> 'userId')::int ELSE pa.user_id END) = $1
         OR (CASE WHEN tm.participant_snapshots ? pb.id::text THEN (tm.participant_snapshots -> pb.id::text ->> 'userId')::int ELSE pb.user_id END) = $1)
     ORDER BY t.started_at DESC NULLS LAST, t.id DESC, tm.round_number, COALESCE(tm.bracket_position, tm.id), tm.id`,
    [userId, ["active", "pending_confirmation"]]
  );
  return mapMatchLinks(rows);
}

function mapMatchLinks(rows) {
  return rows.map((row) => {
    const match = mapTournamentMatch(row.match);
    if (match) match.table = mapTournamentTable(row.tournament_table);
    return {
      tournament: mapTournament(row.tournament),
      match,
      participantA: mapTournamentParticipant(row.participant_a),
      participantB: mapTournamentParticipant(row.participant_b)
    };
  });
}

function matchLinksQuery(relation) { return `SELECT
        row_to_json(t) AS tournament,
        row_to_json(tm) AS match,
        row_to_json(pa) AS participant_a,
        row_to_json(pb) AS participant_b,
        row_to_json(tt) AS tournament_table
     FROM ${relation} tm
     JOIN tournaments t ON t.id = tm.tournament_id
     LEFT JOIN tournament_participants pa ON pa.id = tm.participant_a_id
     LEFT JOIN tournament_participants pb ON pb.id = tm.participant_b_id
     LEFT JOIN tournament_tables tt ON tt.id = tm.table_id`; }

async function listByGameIds(client, gameIds) {
  const ids = [...new Set(gameIds)].filter((id) => Number.isInteger(id));
  if (!ids.length) return [];
  const { rows } = await client.query(
    `${matchLinksQuery(await readRelation(client))}
     WHERE tm.game_id = ANY($1::int[])`,
    [ids]
  );
  return mapMatchLinks(rows);
}

async function listCompletedUnlinked(client) {
  return completedUnlinked(client);
}

async function listCompletedUnlinkedForUser(client, userId) {
  return completedUnlinked(client, [userId]);
}

async function completedUnlinked(client, values = []) {
  const forUser = values.length > 0;
  const { rows } = await client.query(
    `${matchLinksQuery(await readRelation(client))}
     WHERE tm.status = 'completed'
       AND tm.is_bye = FALSE
       AND tm.result IS NOT NULL
       AND tm.game_id IS NULL
       ${forUser ? `AND ((CASE WHEN tm.participant_snapshots ? pa.id::text THEN (tm.participant_snapshots -> pa.id::text ->> 'userId')::int ELSE pa.user_id END) = $1
         OR (CASE WHEN tm.participant_snapshots ? pb.id::text THEN (tm.participant_snapshots -> pb.id::text ->> 'userId')::int ELSE pb.user_id END) = $1)` : ''}
     ORDER BY COALESCE(tm.completed_at, tm.created_at) DESC, tm.id DESC`,
    values
  );
  return mapMatchLinks(rows);
}

async function ratingPoliciesByGameIds(client, gameIds) {
  const ids = [...new Set(gameIds)].filter((id) => Number.isInteger(id));
  if (!ids.length) return new Map();
  const { rows } = await client.query(
    `SELECT tm.game_id, t.rating_policy
     FROM tournament_matches tm
     JOIN tournaments t ON t.id = tm.tournament_id
     WHERE tm.game_id = ANY($1::int[])`,
    [ids]
  );
  return new Map(rows.map((row) => [row.game_id, row.rating_policy || "ranked"]));
}

async function syncEloFromLinkedGames(client) {
  // Only pre-080 migrations still have a compatibility column to synchronize.
  if (await readRelation(client) !== 'tournament_matches') return;
  await client.query(`UPDATE tournament_matches tm SET elo=g.elo,updated_at=NOW()
    FROM games g WHERE tm.game_id=g.id AND tm.elo IS DISTINCT FROM g.elo`);
}

async function writeCanonicalResult(client, match, patch) {
  const { isDeepStrictEqual } = require('node:util');
  const fields = Object.entries(RESULT_FIELDS).filter(([field]) => Object.hasOwn(patch, field) &&
    !isDeepStrictEqual(patch[field] ?? null, match[field] ?? null));
  if (!fields.length) return;
  let gameId = patch.gameId ?? match.gameId;
  if (!gameId && fields.some(([field]) => patch[field] != null)) {
    const { rows } = await client.query(`SELECT p.* FROM tournament_participants p
      WHERE p.id=ANY($1::int[]) ORDER BY CASE WHEN p.id=$2 THEN 0 ELSE 1 END`,
    [[patch.participantAId ?? match.participantAId, patch.participantBId ?? match.participantBId].filter(Number.isInteger),
      patch.participantAId ?? match.participantAId]);
    const { rows: cups } = await client.query('SELECT venue_mode FROM tournaments WHERE id=$1', [match.tournamentId]);
    const game = await require('./games').insert(client, {
      sourceType: 'tournament_match', sourceId: match.id, venueMode: cups[0].venue_mode,
      playerIds: rows.map(p => p.user_id).filter(Number.isInteger),
      participants: rows.map(p => ({ userId: p.user_id, tournamentParticipantId: p.id,
        resultKey: p.user_id ?? -p.id, displayNameSnapshot: p.display_name, factionSnapshot: p.faction || '', isProxy: p.is_proxy }))
    });
    gameId = game.id;
    patch.gameId = gameId;
  }
  if (!gameId) return;
  const values = [gameId];
  const assignments = fields.map(([field, column]) => {
    const json = JSON_FIELDS.has(field);
    values.push(json && patch[field] != null ? JSON.stringify(patch[field]) : patch[field] ?? null);
    return `${column}=$${values.length}${json ? '::jsonb' : ''}`;
  });
  if (Object.hasOwn(patch, 'result') || Object.hasOwn(patch, 'pendingResult')) {
    const status = (patch.status ?? match.status) === 'completed' ? 'completed'
      : (patch.status ?? match.status) === 'pending_confirmation' ? 'pending_confirmation' : 'open';
    values.push(status); assignments.push(`status=$${values.length}`);
  }
  await client.query(`UPDATE games SET ${assignments.join(', ')} WHERE id=$1`, values);
}

async function update(client, id, patch) {
  const relation = await readRelation(client);
  const normalized = relation !== 'tournament_matches';
  patch = { ...patch };
  if (normalized) {
    const match = await lockById(client, id);
    if (!match) return null;
    await writeCanonicalResult(client, match, patch);
  }
  const entries = storedFields(patch, normalized);
  if (!entries.length) return normalized ? findById(client, id) : null;
  const values = [id];
  const assignments = entries.map(([field, column]) => {
    values.push(JSON_FIELDS.has(field) ? JSON.stringify(patch[field] ?? null) : patch[field]);
    return `${column}=$${values.length}${JSON_FIELDS.has(field) ? '::jsonb' : ''}`;
  });
  const { rowCount } = await client.query(`UPDATE tournament_matches SET ${assignments.join(', ')},updated_at=NOW() WHERE id=$1`, values);
  return rowCount ? findById(client, id) : null;
}

async function remove(client, id) {
  const match = await lockById(client, id);
  if (match) await client.query('DELETE FROM tournament_matches WHERE id=$1', [id]);
  return match;
}

module.exports = {
  insert,
  findById,
  lockById,
  listByTournament,
  listByRound,
  listActiveForUser,
  listByGameIds,
  listCompletedUnlinked,
  listCompletedUnlinkedForUser,
  ratingPoliciesByGameIds,
  syncEloFromLinkedGames,
  update,
  remove
};
