const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.28 — 16 ноября 2026\n\n- Турнирная система использует ширину широкоформатных мониторов. Статистика команды показывает все показатели без прокрутки вбок: на больших экранах блоки стоят рядом, на узких таблицы перестраиваются в карточки.\n- Организатор явно завершает турнир после подтверждения всех раундов и матчей. Итоги показывают призёров, официальный топ-10, победителей личного зачёта командных турниров и поддерживают скачивание PNG.\n- Добавлена проверка актуальности результата при вводе и подтверждении из клиентов, поддерживающих версии результатов. Устаревшая отправка возвращает конфликт вместо перезаписи свежих данных.\n- В карточках игр статус отделён от кнопок действий; кнопки переносятся при недостатке места.\n- Утверждённая русская терминология согласована между сайтом, Telegram, мини-приложением и инструментами Companion; раскладка и расстановка различаются по смыслу.",
  "en": "## 1.5.28 — 16 November 2026\n\n- The tournament system uses widescreen monitor space. Faction statistics show every metric without horizontal scrolling: sections sit alongside one another on large screens and tables become labeled cards in narrow layouts.\n- Organizers explicitly finish a tournament after all rounds and matches are confirmed. Published results show medalists, the official top ten and team-event personal winners, with PNG downloads.\n- Added result revision checks for entry and confirmation from clients that support result versions. Stale submissions return a conflict instead of overwriting newer data.\n- Game cards separate status from action buttons, which wrap when space is limited.\n- Approved Russian game terminology is consistent across the website, Telegram, Mini App and Companion tools; Layout and Deployment keep their distinct meanings."
};

module.exports = {
  version: 97,
  name: "widescreen_and_pending_pr_release_notes",
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
      if (/^##[ \t]+v?1\.5\.28(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
