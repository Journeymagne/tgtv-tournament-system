function pageFromRow(row) {
  if (!row) return null;
  return {
    id: row.page_id, locale: row.locale, category: row.category,
    title: row.title, summary: row.summary, markdown: row.markdown,
    version: row.version, updatedAt: row.updated_at.toISOString()
  };
}

async function list(client, locale) {
  const { rows } = await client.query(
    "SELECT page_id, locale, category, title, summary, version, updated_at FROM documentation_pages WHERE locale = $1 ORDER BY position, page_id", [locale]
  );
  return rows.map(pageFromRow);
}

async function get(client, locale, id) {
  const { rows } = await client.query("SELECT * FROM documentation_pages WHERE page_id = $1 AND locale = $2", [id, locale]);
  return pageFromRow(rows[0]);
}

async function update(client, locale, id, { title, summary, markdown, version }, userId) {
  const { rows } = await client.query(`
    UPDATE documentation_pages
    SET title = $3, summary = $4, markdown = $5, version = version + 1, updated_by = $7, updated_at = NOW()
    WHERE page_id = $1 AND locale = $2 AND version = $6
    RETURNING *
  `, [id, locale, title, summary, markdown, version, userId]);
  return pageFromRow(rows[0]);
}

module.exports = { list, get, update };
