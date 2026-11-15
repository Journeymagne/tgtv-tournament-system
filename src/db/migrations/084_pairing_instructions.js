const { defaultPages } = require("../../domain/documentation");

module.exports = {
  version: 84,
  name: "pairing_instructions",
  async up(client) {
    for (const page of defaultPages().filter(page => page.id === "pairing-instructions")) {
      await client.query(`
        INSERT INTO tournaments.documentation_pages
          (page_id, locale, category, title, summary, markdown, position)
        VALUES ($1, $2, $3, $4, $5, $6, 1)
        ON CONFLICT (page_id, locale) DO NOTHING
      `, [page.id, page.locale, page.category, page.title, page.summary, page.markdown]);
    }
  }
};
