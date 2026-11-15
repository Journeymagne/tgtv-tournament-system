const { defaultPages } = require("../../domain/documentation");

// Keep this release copy fixed when later releases update the seed documents.
const releaseNotes = {
  "ru": "## 1.5.24 — 15 ноября 2026\n\n- Сортировка ограничена статистикой: разделом «Игры», статистикой Kill Team и турниров, зачётами, рейтингами и статистикой тирлистов.\n- Убрана лишняя сортировка из результата и подтверждения одной игры, капитанских парингов, списков раундов, личных матчапов команды, короткой истории профилей и управления командами. Порядок игроков, пар и слотов сохраняется.\n- В мини-приложении сортировка сохранена в турнирной таблице; рабочие списки и очки по операциям одной игры показываются без дополнительных переключателей.",
  "en": "## 1.5.24 — 15 November 2026\n\n- Sorting is limited to statistics: Games, Kill Team and tournament statistics, standings, leaderboards and tierlist statistics.\n- Removed unnecessary sorting from individual game results and confirmation, captain pairings, round lists, personal team matchups, short profile histories and team administration. Player, pairing and slot order is preserved.\n- In the Mini App, sorting remains available in tournament standings; work lists and a single game’s operation scores no longer show extra sorting controls."
};

module.exports = {
  version: 94,
  name: "statistics_scope_release_notes",
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
      if (/^##[ \t]+v?1\.5\.24(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
