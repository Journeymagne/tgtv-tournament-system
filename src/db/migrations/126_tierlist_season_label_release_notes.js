const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.2 — 19 ноября 2026

- В статистике тирлистов подпись «Сезон» помещается в одну строку рядом со списком сезонов.`,
  en: `## 1.8.2 — 19 November 2026

- In tier list statistics, the Season label fits on one line next to the season selector.`
};

module.exports = {
  version: 126,
  name: "tierlist_season_label_release_notes",
  async up(client) {
    for (const [locale, note] of Object.entries(releaseNotes)) {
      const { rows: [current] } = await client.query(
        "SELECT markdown FROM tournaments.documentation_pages WHERE page_id='changelog' AND locale=$1 FOR UPDATE",
        [locale]
      );
      if (!current) {
        const page = defaultPages().find(page => page.id === "changelog" && page.locale === locale);
        await client.query(`INSERT INTO tournaments.documentation_pages
          (page_id, locale, category, title, summary, markdown, position)
          VALUES ($1, $2, $3, $4, $5, $6, 0) ON CONFLICT (page_id, locale) DO NOTHING`,
          [page.id, locale, page.category, page.title, page.summary, page.markdown]);
        continue;
      }
      if (/^##[ \t]+v?1\.8\.2(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
