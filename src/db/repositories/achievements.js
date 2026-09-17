const { contentVersion } = require("../../domain/data-url");
const { tournamentNumber } = require("../../domain/achievements");

function view(row) {
  const { image_data, tournament_id, created_at, legacy_source, legacy_id, tournament_number, deleted_at, text_edited, ...rest } = row;
  return { ...rest, tournamentId: tournament_id, createdAt: created_at,
    legacySource: legacy_source || null, legacyId: legacy_id || null,
    tournamentNumber: tournament_number ?? null,
    textEdited: Boolean(text_edited),
    imageUrl: image_data ? `/api/achievements/${row.id}/image?v=${contentVersion(image_data)}` : null };
}

async function list(client, { kind = null, category = null, userId = null, teamId = null } = {}) {
  const { rows } = await client.query(`SELECT a.* FROM achievements a
    WHERE a.deleted_at IS NULL AND ($1::text IS NULL OR a.kind=$1)
      AND ($2::integer IS NULL OR EXISTS (SELECT 1 FROM achievement_awards w WHERE w.achievement_id=a.id AND w.user_id=$2))
      AND ($3::integer IS NULL OR EXISTS (SELECT 1 FROM achievement_awards w WHERE w.achievement_id=a.id AND w.team_id=$3))
      AND ($4::text IS NULL OR a.category=$4)
    ORDER BY CASE WHEN $4='title' THEN a.tournament_number END DESC NULLS LAST,
      a.created_at DESC, a.id DESC`, [kind, userId, teamId, category]);
  return rows.map(view);
}

async function find(client, id) {
  return (await client.query("SELECT * FROM achievements WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0] || null;
}

async function recipients(client, id) {
  return (await client.query(`SELECT w.id, w.user_id AS "userId", w.team_id AS "teamId",
    COALESCE(u.name, t.name) AS name, t.slug, w.awarded_at AS "awardedAt",
    COALESCE((SELECT json_agg(json_build_object('userId', m.user_id, 'name', m.name_snapshot) ORDER BY m.id)
      FROM achievement_award_members m WHERE m.award_id=w.id), '[]'::json) AS members
    FROM achievement_awards w LEFT JOIN users u ON u.id=w.user_id
    LEFT JOIN player_teams t ON t.id=w.team_id WHERE w.achievement_id=$1
    ORDER BY w.awarded_at DESC, w.id DESC`, [id])).rows;
}

async function award(client, achievementId, kind, targetId, actorId, members = []) {
  const result = await client.query(`INSERT INTO achievement_awards (achievement_id, user_id, team_id, awarded_by)
    VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,
  [achievementId, kind === "player" ? targetId : null, kind === "team" ? targetId : null, actorId]);
  if (result.rowCount && kind === "team") {
    for (const member of members) await client.query(`INSERT INTO achievement_award_members (award_id,user_id,name_snapshot)
      VALUES ($1,$2,$3)`, [result.rows[0].id, member.id, member.name]);
  }
  return result.rowCount > 0;
}

// Called in the same transaction and under the same tournament lock as publication.
// Re-publication reconciles the podium instead of retaining outdated winners.
async function syncPodium(client, tournament, actorId) {
  const kind = tournament.participantMode === "team" ? "team" : "player";
  for (const place of [1, 2, 3]) {
    const { rows: [achievement] } = await client.query(`INSERT INTO achievements
      (name, description, kind, emoji, tournament_id, place, category, tournament_number) VALUES ($1,$2,$3,$4,$5,$6,'title',$7)
      ON CONFLICT (tournament_id, place) DO UPDATE SET
        name=CASE WHEN achievements.text_edited THEN achievements.name ELSE EXCLUDED.name END,
        description=CASE WHEN achievements.text_edited THEN achievements.description ELSE EXCLUDED.description END,
        category='title', tournament_number=EXCLUDED.tournament_number
      RETURNING id, deleted_at`, [`${tournament.name} · ${place}`, tournament.name, kind, ["🥇", "🥈", "🥉"][place - 1], tournament.id, place, tournamentNumber(tournament.name)]);
    if (achievement.deleted_at) continue;
    const targets = [];
    for (const row of (tournament.finalResults || []).filter((result) => Number(result.rank) === place)) {
      const result = kind === "team"
        ? await client.query("SELECT team_id AS id FROM tournament_team_rosters WHERE id=$1 AND tournament_id=$2", [row.rosterId, tournament.id])
        : await client.query("SELECT user_id AS id FROM tournament_participants WHERE id=$1 AND tournament_id=$2", [row.participantId, tournament.id]);
      if (result.rows[0]?.id) targets.push(result.rows[0].id);
    }
    const column = kind === "team" ? "team_id" : "user_id";
    await client.query(`DELETE FROM achievement_awards WHERE achievement_id=$1 AND NOT (${column}=ANY($2::integer[]))`, [achievement.id, targets]);
    for (const target of targets) await award(client, achievement.id, kind, target, actorId);
  }
}

module.exports = { view, list, find, recipients, award, syncPodium };
