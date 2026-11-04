const { defaultPages } = require("../../domain/documentation");

module.exports = {
  version: 81,
  name: "documentation_changelog",
  async up(client) {
    for (const page of defaultPages().filter((page) => page.id === "changelog")) {
      await client.query(`
        INSERT INTO tournaments.documentation_pages
          (page_id, locale, category, title, summary, markdown, position)
        VALUES ($1, $2, $3, $4, $5, $6, 0)
        ON CONFLICT (page_id, locale) DO NOTHING
      `, [page.id, page.locale, page.category, page.title, page.summary, page.markdown]);
    }
    // Existing handouts and archived administrator edits stay intact.
    // The public catalog is restricted by PAGE_IDS in the application.
  }
};
