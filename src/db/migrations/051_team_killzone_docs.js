const { defaultPages } = require("../../domain/documentation");

module.exports = {
  version: 51,
  name: "team_killzone_docs",
  async up(client) {
    // Correct untouched seeded pages; keep administrators' published edits.
    for (const page of defaultPages().filter(page => page.id === "wtc-pairings")) {
      const oldRule = page.locale === "ru" ? "%три разные Killzones%" : "%three different Killzones%";
      await client.query(
        `UPDATE documentation_pages SET markdown = $2, version = version + 1, updated_at = NOW()
         WHERE page_id = 'wtc-pairings' AND locale = $1 AND version = 1
           AND updated_by IS NULL AND markdown LIKE $3`,
        [page.locale, page.markdown, oldRule]
      );
    }
  }
};
