const { HttpError } = require('../http/io');
const { PUBLISHED_STATUSES } = require('../db/repositories/tournaments');

const PAGE_SIZE = 6;
// Reused by the page and its two existence probes. No administrator override.
const JOINS = `LEFT JOIN tournament_matches m ON g.source_type='tournament_match' AND m.game_id=g.id
  LEFT JOIN tournament_team_match_games l ON g.source_type='team_match_game' AND l.game_id=g.id
  LEFT JOIN tournament_team_matches tm ON tm.id=l.team_match_id
  LEFT JOIN tournament_team_rosters ra ON ra.id=tm.roster_a_id
  LEFT JOIN tournament_team_rosters rb ON rb.id=tm.roster_b_id
  LEFT JOIN tournaments t ON t.id=COALESCE(m.tournament_id,tm.tournament_id)`;
const ELIGIBLE = `(EXISTS(SELECT 1 FROM game_participants own WHERE own.game_id=g.id AND own.user_id=$1 AND NOT own.is_proxy)
    OR ra.captain_user_id=$1 OR rb.captain_user_id=$1)
  AND (g.source_type NOT IN ('tournament_match','team_match_game') OR t.status=ANY($3::text[]))
  AND ($2='all' OR g.status IN ('open','pending_confirmation'))`;

async function listGames(client, userId, { filter = 'active', cursor, direction = 'next' } = {}) {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !['active', 'all'].includes(filter) ||
      !['next', 'previous'].includes(direction) || (cursor !== undefined && (!Number.isSafeInteger(cursor) || cursor <= 0))) {
    throw new HttpError(400, 'Invalid game page');
  }
  const previous = cursor !== undefined && direction === 'previous';
  const values = [userId, filter, PUBLISHED_STATUSES, cursor ?? null];
  const { rows } = await client.query(`SELECT g.id,g.status,g.source_type,
    t.id AS tournament_id,t.name AS tournament_name,t.slug AS tournament_slug,
    COALESCE(m.round_number,tm.round_number) AS round_number,
    (SELECT jsonb_agg(jsonb_build_object('id',p.result_key,'userId',p.user_id,'name',
      CASE WHEN g.source_type='team_match_game' THEN p.display_name_snapshot ELSE COALESCE(u.name,p.display_name_snapshot) END,
      'total',COALESCE(g.result,g.pending_result->'result')->'scores'->(p.result_key::text)->'total') ORDER BY p.slot)
     FROM game_participants p LEFT JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id) AS players
    FROM games g ${JOINS} WHERE ${ELIGIBLE} AND ($4::int IS NULL OR g.id ${previous ? '>' : '<'} $4)
    ORDER BY g.id ${previous ? 'ASC' : 'DESC'} LIMIT 7`, values);
  const page = rows.slice(0, PAGE_SIZE);
  if (previous) page.reverse();
  if (!page.length) return { games: [], filter, previousCursor: null, nextCursor: null };
  // Each EXISTS stops at the first eligible row; no COUNT/history materialization.
  const { rows: [edges] } = await client.query(`SELECT
    EXISTS(SELECT 1 FROM games g ${JOINS} WHERE ${ELIGIBLE} AND g.id>$4 LIMIT 1) AS newer,
    EXISTS(SELECT 1 FROM games g ${JOINS} WHERE ${ELIGIBLE} AND g.id<$5 LIMIT 1) AS older`,
  [userId, filter, PUBLISHED_STATUSES, page[0].id, page.at(-1).id]);
  return { filter, games: page.map(row => ({ id: row.id, status: row.status, sourceType: row.source_type,
    players: (row.players || []).map(({ id, userId: playerUserId, name }) => ({ id, userId: playerUserId, name })),
    score: row.players?.some(player => player.total !== null) ? row.players.map(player => ({ playerId: player.id, total: player.total })) : null,
    tournament: row.tournament_id ? { id: row.tournament_id, name: row.tournament_name, slug: row.tournament_slug, round: row.round_number } : null })),
  previousCursor: edges.newer ? page[0].id : null, nextCursor: edges.older ? page.at(-1).id : null };
}

module.exports = { listGames, PAGE_SIZE };
