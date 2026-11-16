const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.33 — 16 ноября 2026\n\n- В топ игроков киллтима попадают только участники с минимум 10 завершёнными учитываемыми играми на нём за всё время. Игроки с меньшим числом матчей показаны отдельно: их балл Уилсона помечен как предварительный, без места в рейтинге. Правило действует в статистике киллтимов и тирлистах.",
  "en": "## 1.5.33 — 16 November 2026\n\n- Faction player leaderboards now require at least 10 eligible completed games on that faction across all time. Players with fewer games appear separately with a provisional Wilson score and no ranking place. This applies to faction statistics and Tier Lists."
};

module.exports = {
  version: 104,
  name: "faction_qualification_release_notes",
  async up(client) {
    for (const locale of ["ru", "en"]) {
      const { rows: [current] } = await client.query(
        "SELECT markdown FROM tournaments.documentation_pages WHERE page_id='changelog' AND locale=$1 FOR UPDATE",
        [locale]
      );
      if (!current) {
        const page = defaultPages().find(page => page.id === "changelog" && page.locale === locale);
        await client.query(`
          INSERT INTO tournaments.documentation_pages
            (page_id, locale, category, title, summary, markdown, position)
          VALUES ($1, $2, $3, $4, $5, $6, 0)
          ON CONFLICT (page_id, locale) DO NOTHING
        `, [page.id, page.locale, page.category, page.title, page.summary, page.markdown]);
        continue;
      }
      if (/^##[ \t]+v?1\.5\.33(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      let markdown;
      if (firstRelease >= 0) {
        markdown = current.markdown.slice(0, firstRelease) + releaseNotes[locale] + "\n\n" + current.markdown.slice(firstRelease);
      } else {
        const separator = !current.markdown || /\n\r?\n$/.test(current.markdown) ? "" : /\n$/.test(current.markdown) ? "\n" : "\n\n";
        markdown = current.markdown + separator + releaseNotes[locale] + "\n";
      }
      if (markdown === current.markdown) continue;
      await client.query(`
        UPDATE tournaments.documentation_pages
        SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1
      `, [locale, markdown]);
    }
  }
};
