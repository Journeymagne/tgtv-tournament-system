const { defaultPages } = require("../../domain/documentation");

module.exports = {
  version: 76,
  name: "documentation_octarius_a4",
  async up(client) {
    for (const page of defaultPages().filter((page) => page.id === "handouts")) {
      await client.query(`
        INSERT INTO tournaments.documentation_pages
          (page_id, locale, category, title, summary, markdown, position)
        SELECT $1, $2, $3, $4, $5, $6, COALESCE(MAX(position), -1) + 1
        FROM tournaments.documentation_pages WHERE locale = $2
        ON CONFLICT (page_id, locale) DO UPDATE
          SET markdown = EXCLUDED.markdown,
              version = documentation_pages.version + 1, updated_at = NOW()
      `, [page.id, page.locale, page.category, page.title, page.summary, page.markdown]);
    }
  }
};
