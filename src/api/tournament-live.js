const { HttpError } = require("../http/io");
const { requirePositiveIntId } = require("./params");
const { decodeDataUrl, contentVersion } = require("../domain/data-url");
const { PUBLISHED_STATUSES } = require("../db/repositories/tournaments");

async function revision({ client, user }) {
  // Sequence increments are visible before commit. The snapshot also changes
  // when a pending writer commits, so polling cannot miss that writer's data.
  const { rows: [row] } = await client.query("SELECT last_value::text || ':' || pg_current_snapshot()::text AS revision FROM tournament_feed_revision");
  return { revision: row.revision, isAdmin: Boolean(user?.isAdmin) };
}

async function logo({ client, params, user, req, query }) {
  const id = requirePositiveIntId(params.id, 404, "Logo not found");
  const sql = params.kind === "team"
    ? "SELECT logo_data FROM player_teams WHERE id = $1"
    : params.kind === "tournament"
      ? "SELECT logo_data, status FROM tournaments WHERE id = $1"
      : "SELECT r.team_logo_snapshot AS logo_data, t.status FROM tournament_team_rosters r JOIN tournaments t ON t.id = r.tournament_id WHERE r.id = $1";
  const { rows: [row] } = await client.query(sql, [id]);
  if (!row || (row.status && !user?.isAdmin && !PUBLISHED_STATUSES.includes(row.status))) throw new HttpError(404, "Logo not found");
  const file = decodeDataUrl(row.logo_data);
  if (!file) throw new HttpError(404, "Logo not found");
  const version = contentVersion(row.logo_data);
  const headers = { ETag: `"${version}"`, "Cache-Control": query?.get("v") === version ? "private, max-age=604800, immutable" : "private, max-age=0, must-revalidate" };
  if (req?.headers?.["if-none-match"] === headers.ETag) return { status: 304, buffer: null, headers };
  return { buffer: file.bytes, contentType: file.contentType, headers };
}

module.exports = { revision, logo };
