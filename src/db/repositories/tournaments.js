const { TOURNAMENT_COLUMNS: COLUMNS, mapTournament } = require("../rows");

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
  description: "description",
  gameSystem: "game_system",
  startsAt: "starts_at",
  rulesSummary: "rules_summary",
  rulesLink: "rules_link",
  status: "status",
  format: "format",
  swissRoundCount: "swiss_round_count",
  singleEliminationSize: "single_elimination_size",
  tiebreakerOrder: "tiebreaker_order",
  ratingPolicy: "rating_policy",
  challengeCreditPolicy: "challenge_credit_policy",
  finalResults: "final_results",
  publishedAt: "published_at",
  startedAt: "started_at",
  completedAt: "completed_at",
  cancelledAt: "cancelled_at"
};

function valueFor(field, value) {
  if (["tiebreakerOrder"].includes(field)) return value || [];
  if (["finalResults"].includes(field)) return value === undefined ? null : JSON.stringify(value);
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
        challenge_credit_policy)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10, $11, $12::text[], $13, $14)
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
      tournament.challengeCreditPolicy || "count"
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
            COALESCE(pc.participant_count, 0)::int AS participant_count,
            COALESCE(rc.round_count, 0)::int AS round_count
     FROM tournaments t
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS participant_count
       FROM tournament_participants
       WHERE status NOT IN ('withdrawn', 'removed')
       GROUP BY tournament_id
     ) pc ON pc.tournament_id = t.id
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS round_count
       FROM tournament_rounds
       GROUP BY tournament_id
     ) rc ON rc.tournament_id = t.id
     WHERE t.status = ANY($1::text[])
     ORDER BY COALESCE(t.starts_at, t.created_at) DESC, t.id DESC`,
    [PUBLISHED_STATUSES]
  );
  return rows.map(mapTournament);
}

async function listAdmin(client) {
  const { rows } = await client.query(
    `SELECT t.*,
            COALESCE(pc.participant_count, 0)::int AS participant_count,
            COALESCE(rc.round_count, 0)::int AS round_count
     FROM tournaments t
     LEFT JOIN (
       SELECT tournament_id, COUNT(*)::int AS participant_count
       FROM tournament_participants
       WHERE status NOT IN ('withdrawn', 'removed')
       GROUP BY tournament_id
     ) pc ON pc.tournament_id = t.id
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
    const cast = field === "tiebreakerOrder" ? "::text[]" : field === "finalResults" ? "::jsonb" : "";
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

module.exports = {
  PUBLISHED_STATUSES,
  isSlugTaken,
  insert,
  findById,
  lockById,
  findBySlug,
  listPublished,
  listAdmin,
  update
};
