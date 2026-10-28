const { TOURNAMENT_COLUMNS: COLUMNS, mapTournament } = require("../rows");
const { currentSeason } = require("../../../public/game-data");

const PUBLISHED_STATUSES = [
  "registration_open",
  "registration_closed",
  "in_progress",
  "completed",
  "cancelled"
];

const FIELD_COLUMNS = {
  ownerUserId: "owner_user_id",
  slug: "slug",
  name: "name",
  logoData: "logo_data",
  description: "description",
  gameSystem: "game_system",
  startsAt: "starts_at",
  registrationLimit: "registration_limit",
  factionCount: "faction_count",
  rulesSummary: "rules_summary",
  rulesLink: "rules_link",
  status: "status",
  format: "format",
  swissRoundCount: "swiss_round_count",
  singleEliminationSize: "single_elimination_size",
  tiebreakerOrder: "tiebreaker_order",
  ratingPolicy: "rating_policy",
  challengeCreditPolicy: "challenge_credit_policy",
  seasonId: "season_id",
  venueMode: "venue_mode",
  venueAddress: "venue_address",
  finalResults: "final_results",
  roundDraft: "round_draft",
  participantMode: "participant_mode",
  teamSize: "team_size",
  pairingType: "pairing_type",
  captainPairingEnabled: "captain_pairing_enabled",
  teamTiebreakerOrder: "team_tiebreaker_order",
  teamTablesLocked: "team_tables_locked",
  publishedAt: "published_at",
  startedAt: "started_at",
  completedAt: "completed_at",
  cancelledAt: "cancelled_at"
};

function valueFor(field, value) {
  if (["tiebreakerOrder"].includes(field)) return value || [];
  if (["finalResults", "roundDraft"].includes(field)) return value === undefined ? null : JSON.stringify(value);
  return value === undefined ? null : value;
}

async function isSlugTaken(client, slug, excludeId = null) {
  const { rows } = await client.query(
    `SELECT 1 FROM tournaments
     WHERE slug = $1 AND ($2::int IS NULL OR id <> $2) LIMIT 1`,
    [slug, excludeId]
  );
  return rows.length > 0;
}

async function insert(client, tournament) {
  const { rows } = await client.query(
    `INSERT INTO tournaments
       (owner_user_id, slug, name, description, game_system, starts_at,
        rules_summary, rules_link, status, format, swiss_round_count,
        single_elimination_size, tiebreaker_order, rating_policy,
        challenge_credit_policy, season_id, venue_mode, participant_mode, team_size, pairing_type, logo_data, registration_limit, captain_pairing_enabled, team_tiebreaker_order, faction_count, venue_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12::text[], $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23::text[], $24, $25)
     RETURNING ${COLUMNS}`,
    [
      tournament.ownerUserId || null,
      tournament.slug,
      tournament.name || "",
      tournament.description || "",
      tournament.gameSystem || "Warhammer 40k Kill Team",
      tournament.startsAt || null,
      tournament.rulesSummary || "",
      tournament.rulesLink || "",
      tournament.format,
      tournament.swissRoundCount || null,
      tournament.singleEliminationSize || null,
      tournament.tiebreakerOrder || [],
      tournament.ratingPolicy || "ranked",
      tournament.challengeCreditPolicy || "count",
      tournament.seasonId || currentSeason().id,
      tournament.venueMode || "tts",
      tournament.participantMode || "individual",
      tournament.teamSize || null,
      tournament.pairingType || null,
      tournament.logoData || null,
      tournament.registrationLimit || null,
      tournament.captainPairingEnabled !== false,
      tournament.teamTiebreakerOrder ?? null,
      tournament.factionCount || 1,
      tournament.venueAddress || ""
    ]
  );
  return mapTournament(rows[0]);
}

async function findById(client, id) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM tournaments WHERE id = $1`, [id]);
  return mapTournament(rows[0]);
}

async function lockById(client, id) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM tournaments WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapTournament(rows[0]);
}

async function findBySlug(client, slug) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM tournaments WHERE slug = $1`, [
    slug
  ]);
  return mapTournament(rows[0]);
}

async function listPublished(client) {
  const { rows } = await client.query(
     `SELECT t.*,
             CASE WHEN t.participant_mode = 'team'
               THEN COALESCE(trc.roster_count, 0)
               ELSE COALESCE(pc.participant_count, 0)
             END::int AS participant_count,
            COALESCE(rc.round_count, 0)::int AS round_count
     FROM tournaments t
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS participant_count
       FROM tournament_participants
       WHERE status NOT IN ('withdrawn', 'removed')
       GROUP BY tournament_id
      ) pc ON pc.tournament_id = t.id
      LEFT JOIN (
        SELECT tournament_id, COUNT(*)::int AS roster_count
        FROM tournament_team_rosters
        WHERE status <> 'withdrawn'
        GROUP BY tournament_id
      ) trc ON trc.tournament_id = t.id
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS round_count
       FROM tournament_rounds
       GROUP BY tournament_id
     ) rc ON rc.tournament_id = t.id
     WHERE t.status = ANY($1::text[])
     ORDER BY t.created_at DESC, t.id DESC`,
    [PUBLISHED_STATUSES]
  );
  return rows.map(mapTournament);
}

async function listAdmin(client) {
  const { rows } = await client.query(
     `SELECT t.*,
             CASE WHEN t.participant_mode = 'team'
               THEN COALESCE(trc.roster_count, 0)
               ELSE COALESCE(pc.participant_count, 0)
             END::int AS participant_count,
            COALESCE(rc.round_count, 0)::int AS round_count
     FROM tournaments t
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS participant_count
       FROM tournament_participants
       WHERE status NOT IN ('withdrawn', 'removed')
       GROUP BY tournament_id
      ) pc ON pc.tournament_id = t.id
      LEFT JOIN (
        SELECT tournament_id, COUNT(*)::int AS roster_count
        FROM tournament_team_rosters
        WHERE status <> 'withdrawn'
        GROUP BY tournament_id
      ) trc ON trc.tournament_id = t.id
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS round_count
       FROM tournament_rounds
       GROUP BY tournament_id
     ) rc ON rc.tournament_id = t.id
     ORDER BY t.created_at DESC, t.id DESC`
  );
  return rows.map(mapTournament);
}

async function update(client, id, patch) {
  const assignments = [];
  const values = [id];

  for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    values.push(valueFor(field, patch[field]));
    const cast = ["tiebreakerOrder", "teamTiebreakerOrder"].includes(field)
      ? "::text[]"
      : ["finalResults", "roundDraft"].includes(field)
        ? "::jsonb"
        : "";
    assignments.push(`${column} = $${values.length}${cast}`);
  }
  if (!assignments.length) return findById(client, id);

  const { rows } = await client.query(
    `UPDATE tournaments
     SET ${assignments.join(", ")}, updated_at = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    values
  );
  return mapTournament(rows[0]);
}

async function remove(client, id) {
  const { rows } = await client.query(
    `DELETE FROM tournaments
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id]
  );
  return mapTournament(rows[0]);
}

module.exports = {
  PUBLISHED_STATUSES,
  isSlugTaken,
  insert,
  findById,
  lockById,
  findBySlug,
  listPublished,
  listAdmin,
  update,
  remove
};

async function listPage(client, query, user = null, { mine = false } = {}) {
  const {TOURNAMENT_COLUMNS} = require('../rows');
  const columns=TOURNAMENT_COLUMNS.split(',').map(s=>s.trim()).filter(s=>s&&!['logo_data','rules_link','round_draft','final_results'].includes(s)).map(s=>'t.'+s).join(',');
  const result=await require('../../resources/pages').select(client, `SELECT ${columns},
    CASE WHEN t.logo_data IS NOT NULL THEN '/api/tournament-logos/'||t.id||'?v='||left(encode(sha256(convert_to(t.logo_data,'UTF8')),'hex'),16) END AS logo_data,
    CASE WHEN t.rules_link LIKE 'data:%' THEN '/api/tournaments/'||t.slug||'/rules?v='||left(encode(sha256(convert_to(t.rules_link,'UTF8')),'hex'),16) ELSE t.rules_link END AS rules_link,
    CASE WHEN t.participant_mode='team' THEN (SELECT count(*) FROM tournament_team_rosters WHERE tournament_id=t.id AND status<>'withdrawn')
    ELSE (SELECT count(*) FROM tournament_participants WHERE tournament_id=t.id AND status NOT IN ('withdrawn','removed')) END::int AS participant_count,
    (SELECT count(*)::int FROM tournament_rounds WHERE tournament_id=t.id) AS round_count
    FROM tournaments t WHERE ${mine ? `
      t.owner_user_id=$1 OR t.id=ANY($2::int[]) OR (
        t.status=ANY($3::text[]) AND (
          (t.participant_mode='individual' AND EXISTS (
            SELECT 1 FROM tournament_participants p
            WHERE p.tournament_id=t.id AND p.user_id=$1 AND p.status NOT IN ('withdrawn','removed')
          )) OR (t.participant_mode='team' AND EXISTS (
            SELECT 1 FROM tournament_team_rosters r
            WHERE r.tournament_id=t.id AND r.status<>'withdrawn' AND (
              r.captain_user_id=$1 OR EXISTS (
                SELECT 1 FROM tournament_team_roster_members m
                WHERE m.roster_id=r.id AND m.user_id=$1 AND m.ended_at IS NULL
              )
            )
          ))
        )
      )
    ` : `($1::boolean AND (t.owner_user_id=$2 OR $3 OR t.id=ANY($4::int[])))
      OR (NOT $1 AND t.status=ANY($5::text[]))`} ORDER BY t.created_at DESC,t.id DESC`,
    mine ? [user?.id || null, user?.managedTournamentIds || [], PUBLISHED_STATUSES]
      : [!!user,user?.id||null,!!(user?.isAdmin||user?.isSuperAdmin),user?.managedTournamentIds||[],PUBLISHED_STATUSES],query);
  return {tournaments:result.rows.map(mapTournament),pagination:result.pagination};
}
module.exports.listPage=listPage;
