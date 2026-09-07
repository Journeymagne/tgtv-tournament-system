const { defaultPages } = require("../../domain/documentation");

module.exports = {
  version: 18,
  name: "editable_documentation",
  async up(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS documentation_pages (
        page_id TEXT NOT NULL,
        locale TEXT NOT NULL CHECK (locale IN ('ru', 'en')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        markdown TEXT NOT NULL,
        position INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (page_id, locale)
      )
    `);
    const pages = defaultPages();
    for (const [position, page] of pages.entries()) {
      await client.query(`
        INSERT INTO documentation_pages (page_id, locale, category, title, summary, markdown, position)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (page_id, locale) DO NOTHING
      `, [page.id, page.locale, page.category, page.title, page.summary, page.markdown, position]);
    }
  }
};
