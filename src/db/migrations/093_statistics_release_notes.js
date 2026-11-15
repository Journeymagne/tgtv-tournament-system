const { defaultPages } = require("../../domain/documentation");

// Keep this release copy fixed when later releases update the seed documents.
const releaseNotes = {
  "ru": "## 1.5.23 — 15 ноября 2026\n\n- Добавлена сортировка по всем столбцам в статистике, рейтингах, истории игр, турнирных таблицах, мини-приложении и тирлистах. Официальные места сохраняются; сортировка учитывает весь список до разделения на страницы и ограничения топ-N.\n- Исправлены подсчёт статистики сыгранных Kill Teams, разделение прокси-участников и обработка зеркальных матчей. Выбранная сортировка и введённые данные сохраняются при обновлении таблиц.\n- В командных турнирах во вкладке «Таблица» появился «Личный зачёт» всех участников: ТП за победу/ничью/поражение — 3/1/0, Total GP — сумма игровых очков, Diff GP — разница своих GP и GP соперников. Все столбцы сортируются; результаты учитывают замены и завершённые личные игры в текущем туре.\n- Убраны карты из превью в списке игр и истории. Карты внутри турниров сохранены.",
  "en": "## 1.5.23 — 15 November 2026\n\n- Added sorting by every column across statistics, rankings, game history, tournament tables, the Mini App and tierlists. Official places are retained; sorting uses the full list before pagination and top-N limits.\n- Fixed statistics for played Kill Teams, separation of proxy participants and mirror-match handling. Selected sorting and entered data survive table updates.\n- Team tournaments now have a Personal standings tab for every participant: a win/draw/loss awards 3/1/0 TP, Total GP sums game points, and Diff GP is own GP minus opponents’ GP. Every column is sortable; results retain substituted players and include completed personal games in the current round.\n- Removed map previews from game lists and history. Maps remain available inside tournaments."
};

module.exports = {
  version: 93,
  name: "statistics_release_notes",
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
      if (/^##[ \t]+v?1\.5\.23(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
