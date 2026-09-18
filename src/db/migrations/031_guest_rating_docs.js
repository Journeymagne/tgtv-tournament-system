const { defaultPages } = require("../../domain/documentation");

module.exports = {
  version: 31,
  name: "guest_rating_docs",
  async up(client) {
    // Refresh only untouched seeded documentation; preserve administrators' edits.
    for (const page of defaultPages().filter((page) => page.id === "mmr")) {
      await client.query(
        `UPDATE documentation_pages SET markdown = $2, version = version + 1, updated_at = NOW()
         WHERE page_id = 'mmr' AND locale = $1 AND version = 1
           AND updated_by IS NULL AND markdown LIKE '%+15%'`,
        [page.locale, page.markdown]
      );
    }
  }
};
