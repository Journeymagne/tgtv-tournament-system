const { randomUUID } = require("node:crypto");
const { HttpError } = require("../../http/io");

function summary(row, published = false) {
  const project = published ? row.published : row.project;
  return {
    id: published ? row.publication_id : row.project_id,
    name: project.team.name, subtitle: project.team.subtitle || "", version: project.team.version || "",
    operativeCount: project.operatives.length, accent: project.layout.accent,
    updatedAt: published ? row.published_at : row.updated_at,
    ...(published ? {} : { revision: row.revision, publicationId: row.publication_id, publishedAt: row.published_at })
  };
}

async function drafts(client, owner) {
  const { rows } = await client.query(`SELECT project_id, revision, updated_at, publication_id, published_at,
    project->'team' AS team, jsonb_array_length(project->'operatives') AS count,
    project->'layout'->>'accent' AS accent FROM studio_projects WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC`, [owner]);
  return rows.map(row => ({ id: row.project_id, name: row.team.name, subtitle: row.team.subtitle || "",
    version: row.team.version || "", operativeCount: row.count, accent: row.accent, revision: row.revision,
    updatedAt: row.updated_at, publicationId: row.publication_id, publishedAt: row.published_at }));
}

async function draft(client, owner, id) {
  const { rows } = await client.query("SELECT * FROM studio_projects WHERE owner_id=$1 AND project_id=$2 AND deleted_at IS NULL", [owner, id]);
  return rows[0] ? { ...summary(rows[0]), project: rows[0].project } : null;
}

function ownerControls(row, owner) {
  return owner != null && String(row.owner_id) === String(owner)
    ? { canRename: true, projectId: row.project_id, revision: row.revision } : {};
}

async function library(client, search, offset, limit = 30, owner = null) {
  const where = "deleted_at IS NULL AND published IS NOT NULL AND strpos(lower((published->'team'->>'name') || ' ' || COALESCE(published->'team'->>'subtitle','')),lower($1))>0";
  const { rows } = await client.query(`SELECT owner_id, project_id, revision, publication_id, published_at, published->'team' AS team,
    jsonb_array_length(published->'operatives') AS count, published->'layout'->>'accent' AS accent
    FROM studio_projects WHERE ${where} ORDER BY published_at DESC, publication_id LIMIT $2 OFFSET $3`, [search, limit, offset]);
  const count = await client.query(`SELECT count(*)::int AS total FROM studio_projects WHERE ${where}`, [search]);
  return { teams: rows.map(row => ({ id: row.publication_id, name: row.team.name, subtitle: row.team.subtitle || "",
    version: row.team.version || "", operativeCount: row.count, accent: row.accent, updatedAt: row.published_at,
    ...ownerControls(row, owner) })), total: count.rows[0].total };
}

async function publication(client, id, owner = null) {
  const { rows } = await client.query("SELECT * FROM studio_projects WHERE publication_id=$1 AND published IS NOT NULL AND deleted_at IS NULL", [id]);
  return rows[0] ? { ...summary(rows[0], true), project: rows[0].published, ...ownerControls(rows[0], owner) } : null;
}

async function rename(client, owner, id, name, revision) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["studio:" + owner + ":" + id]);
  const { rows: [previous] } = await client.query("SELECT revision, deleted_at FROM studio_projects WHERE owner_id=$1 AND project_id=$2", [owner, id]);
  if (!previous) throw new HttpError(404, "Команда не найдена.");
  if (previous.deleted_at) throw new HttpError(410, "Команда удалена.");
  if (previous.revision !== revision) throw new HttpError(409, "Команда изменена в другой вкладке. Обновите список и повторите переименование.");
  // Change only the title in each snapshot; private rules must stay private.
  const { rows: [updated] } = await client.query(`UPDATE studio_projects SET
    project=jsonb_set(project,'{team,name}',to_jsonb($3::text)),
    published=CASE WHEN published IS NULL THEN NULL ELSE jsonb_set(published,'{team,name}',to_jsonb($3::text)) END,
    revision=revision+1, updated_at=NOW()
    WHERE owner_id=$1 AND project_id=$2 RETURNING *`, [owner, id, name]);
  return summary(updated);
}

// The router supplies a transaction. The lock covers first saves as well as
// existing rows, so two tabs cannot both create revision 1 for the same draft.
async function save(client, owner, project, revision, publish, recoveryId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["studio:" + owner + ":" + project.team.id]);
  const { rows } = await client.query("SELECT * FROM studio_projects WHERE owner_id=$1 AND project_id=$2", [owner, project.team.id]);
  const previous = rows[0];
  if (previous?.deleted_at) throw new HttpError(410, "Команда удалена. Создайте новую команду, чтобы продолжить работу.");
  if ((previous?.revision || 0) !== revision) {
    if (!recoveryId) throw new HttpError(409, "Команда изменена в другой вкладке. Сохраните правки отдельным черновиком в аккаунте.");
    // Preserve both versions in PostgreSQL. A conflicting publish only creates
    // a private draft; the existing publication must not change implicitly.
    const copy = structuredClone(project), suffix = " (копия правок)";
    copy.team.id = recoveryId;
    copy.team.name = copy.team.name.slice(0, 200 - suffix.length) + suffix;
    const recovered = await save(client, owner, copy, 0, false);
    return { ...recovered, recoveredFrom: project.team.id, original: previous ? summary(previous) : null };
  }
  const now = new Date().toISOString();
  const { rows: saved } = await client.query(`INSERT INTO studio_projects
    (owner_id, project_id, project, revision, updated_at, publication_id, published, published_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (owner_id,project_id) DO UPDATE SET
    project=EXCLUDED.project, revision=EXCLUDED.revision, updated_at=EXCLUDED.updated_at,
    publication_id=EXCLUDED.publication_id, published=EXCLUDED.published, published_at=EXCLUDED.published_at
    RETURNING *`, [owner, project.team.id, project, revision + 1, now,
    previous?.publication_id || (publish ? randomUUID() : null),
    publish ? project : previous?.published || null,
    publish ? now : previous?.published_at || null]);
  return summary(saved[0]);
}

async function deletedIds(client, owner) {
  const { rows } = await client.query("SELECT project_id FROM studio_projects WHERE owner_id=$1 AND deleted_at IS NOT NULL", [owner]);
  return rows.map(row => row.project_id);
}

async function remove(client, owner, id, revision) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["studio:" + owner + ":" + id]);
  const { rows } = await client.query("SELECT revision, deleted_at FROM studio_projects WHERE owner_id=$1 AND project_id=$2", [owner, id]);
  const previous = rows[0];
  if (previous?.deleted_at) return { id, deleted: true };
  if (!previous && revision > 0) throw new HttpError(404, "Команда не найдена.");
  if ((previous?.revision || 0) !== revision) throw new HttpError(409, "Команда изменена в другой вкладке. Обновите список черновиков и проверьте её перед удалением.");
  // Also protects local-only drafts whose first upload has not completed yet.
  await client.query(`INSERT INTO studio_projects (owner_id, project_id, project, revision, deleted_at)
    VALUES ($1,$2,'{}'::jsonb,1,NOW()) ON CONFLICT (owner_id,project_id) DO UPDATE SET
    project='{}'::jsonb, published=NULL, publication_id=NULL, published_at=NULL,
    revision=studio_projects.revision+1, updated_at=NOW(), deleted_at=NOW()`, [owner, id]);
  return { id, deleted: true };
}

module.exports = { drafts, draft, library, publication, save, deletedIds, remove, rename };
