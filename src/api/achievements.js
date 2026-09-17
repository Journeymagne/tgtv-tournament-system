const repo = require("../db/repositories/achievements");
const { HttpError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const { decodeDataUrl, contentVersion } = require("../domain/data-url");
const { tournamentNumber } = require("../domain/achievements");

const idValue = (value) => requirePositiveIntId(value, 400, "Invalid achievement or recipient ID");
async function requireAchievement(client, id) {
  const achievement = await repo.find(client, idValue(id));
  if (!achievement) throw new HttpError(404, "Achievement not found");
  return achievement;
}
async function list({ client, query }) {
  const kind = query.get("kind");
  const category = query.get("category");
  if (category && !["achievement", "title"].includes(category)) throw new HttpError(400, "Invalid achievement category");
  if (kind && !["player", "team"].includes(kind)) throw new HttpError(400, "Invalid achievement kind");
  return { achievements: await repo.list(client, { kind, category,
    userId: query.has("userId") ? idValue(query.get("userId")) : null,
    teamId: query.has("teamId") ? idValue(query.get("teamId")) : null }) };
}
async function get({ client, params }) {
  const achievement = await requireAchievement(client, params.id);
  return { achievement: repo.view(achievement), recipients: await repo.recipients(client, achievement.id) };
}
async function image({ client, params }) {
  const achievement = await requireAchievement(client, params.id);
  const file = decodeDataUrl(achievement.image_data);
  if (!file) throw new HttpError(404, "Achievement image not found");
  return { buffer: file.bytes, contentType: file.contentType,
    headers: { ETag: `"${contentVersion(achievement.image_data)}"`, "Cache-Control": "public, max-age=3600" } };
}
async function create({ client, body }) {
  const category = body.category || "achievement";
  if (!["achievement", "title"].includes(category)) throw new HttpError(400, "Invalid achievement category");
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 120 || !description || description.length > 2000 || !["player", "team"].includes(body.kind)) {
    throw new HttpError(400, "Name, description and achievement kind are required");
  }
  const imageData = body.imageData || null;
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  const file = decodeDataUrl(imageData);
  if (imageData && (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.contentType) || file.bytes.length > 1024 * 1024)) {
    throw new HttpError(400, "Upload a PNG, JPEG or WebP image up to 1 MiB");
  }
  if (!imageData && (!emoji || emoji.length > 64 || [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(emoji)].length !== 1
      || !/(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)/u.test(emoji))) {
    throw new HttpError(400, "Choose one emoji or upload an image");
  }
  const { rows: [row] } = await client.query(`INSERT INTO achievements (name, description, kind, image_data, category, tournament_number, emoji)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [name, description, body.kind, imageData, category, category === "title" ? tournamentNumber(name) : null, imageData ? "🏅" : emoji]);
  return { status: 201, body: { achievement: repo.view(row) } };
}
async function award({ client, params, body, user }) {
  await client.query("SELECT id FROM achievements WHERE id=$1 FOR UPDATE", [idValue(params.id)]);
  const achievement = await requireAchievement(client, params.id);
  if (achievement.tournament_id) throw new HttpError(409, "Event medals are awarded automatically from final standings");
  const targetId = idValue(body.targetId);
  const table = achievement.kind === "team" ? "player_teams" : "users";
  const target = await client.query(`SELECT id FROM ${table} WHERE id=$1 FOR KEY SHARE`, [targetId]);
  if (!target.rowCount) throw new HttpError(404, "Recipient not found");
  const memberIds = body.memberIds ?? [];
  if (!Array.isArray(memberIds) || memberIds.length > 100 || (achievement.kind !== "team" && memberIds.length)) {
    throw new HttpError(400, "A roster can only be specified for a team achievement");
  }
  const ids = [...new Set(memberIds.map(idValue))];
  const members = ids.length ? (await client.query(`SELECT u.id,u.name FROM users u
    WHERE u.id=ANY($1::integer[]) AND EXISTS (SELECT 1 FROM player_team_memberships m
      WHERE m.team_id=$2 AND m.user_id=u.id) ORDER BY u.name`, [ids, targetId])).rows : [];
  if (members.length !== ids.length) throw new HttpError(400, "Every selected player must belong to this team's current or former roster");
  return { awarded: await repo.award(client, achievement.id, achievement.kind, targetId, user.id, members) };
}
async function remove({ client, params }) {
  const id = idValue(params.id);
  const result = await client.query("UPDATE achievements SET deleted_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id", [id]);
  if (!result.rowCount) throw new HttpError(404, "Achievement not found");
  return { deleted: true };
}
async function update({ client, params, body }) {
  const id = idValue(params.id);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 120 || !description || description.length > 2000) {
    throw new HttpError(400, "Name (up to 120 characters) and description (up to 2000 characters) are required");
  }
  const { rows: [row] } = await client.query(`UPDATE achievements SET name=$2, description=$3, text_edited=TRUE,
    tournament_number=CASE WHEN category='title' AND tournament_id IS NULL AND name IS DISTINCT FROM $2 THEN $4 ELSE tournament_number END
    WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [id, name, description, tournamentNumber(name)]);
  if (!row) throw new HttpError(404, "Achievement not found");
  return { achievement: repo.view(row) };
}
module.exports = { list, get, image, create, award, remove, update };
