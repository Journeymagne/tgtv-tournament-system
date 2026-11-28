const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.7 — 28 ноября 2026

- На старых мобильных браузерах игроки и организаторы снова могут открыть турнир и посмотреть текущий раунд.
- Сообщение «Турнир не найден» появляется, когда турнир недоступен по ссылке. При ошибке загрузки страница предлагает попробовать ещё раз.
- При открытии прямой ссылки карточка турнира сразу показывает подписи на выбранном языке и время начала с указанием UTC.`,
  en: `## 1.8.7 — 28 November 2026

- Players and organizers can open tournaments and view the current round again in older mobile browsers.
- The page shows “Tournament not found” when the tournament is unavailable at that link. If the page fails to load, it prompts you to try again.
- Opening a tournament link now shows labels in your selected language and a start time marked in UTC on the initial card.`
};

module.exports = {
  version: 132,
  name: "tournament_mobile_release_notes",
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
      if (/^##[ \t]+v?1\.8\.7(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
