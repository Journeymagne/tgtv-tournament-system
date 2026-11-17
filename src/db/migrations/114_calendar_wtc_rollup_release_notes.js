const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.6.0 — 17 ноября 2026\n\n- Добавлен календарь событий Kill Team: календарь и список, мобильные карточки с афишей, поиск и выбор российских городов с подсказками. Сингл и командные события различаются цветом, турниры с вашим участием отмечены отдельно.\n- Турнир с датой старта автоматически появляется в календаре; изменение даты переносит связанное событие без дублей и потери данных анонса. Автоматические черновики видны только администраторам, после публикации — всем.\n- Добавлен командный формат WTC Doubles для TTS и очных турниров: составы по два игрока, отдельная последовательность парингов, подсчёт результатов и фиксированные тайбрейки. Настройки тайбрейков остальных форматов приведены к общему виду.\n- Просмотр турнира и управление объединены на одной странице. Кнопки администратора остаются видимыми; в общей шапке показаны формат, размер команды и тип парингов. Ожидающие результаты можно открыть на проверку из списка матчей.\n- В завершённых турнирах первой открывается вкладка «Итоги», а «Обзор» сохраняет карты, миссии и результаты последнего тура. Исправлены предупреждения о назначении нескольких пар на один физический стол и работа с парами раунда.\n- В профиле игрока статистика стала компактнее; личные данные и управление аккаунтом перенесены в «Настройки» для владельца и администраторов. Обновлены отображение и разделы ачивок.\n- В статистике добавлены поиск киллтима с подсказками и корректный выбор всего периода; раздел винрейта получил короткие названия «Винрейт» и «Winrates».",
  "en": "## 1.6.0 — 17 November 2026\n\n- Added a Kill Team event calendar with a month view and list, mobile event cards with tournament posters, search, and Russian city autocomplete. Singles and team events have distinct colours, and tournaments you participate in have a personal marker.\n- Dated tournaments now appear in the calendar automatically. Changing the start date moves the linked event without duplicates or losing announcement details. Automatically generated drafts are administrator-only until publication.\n- Added WTC Doubles for TTS and in-person tournaments: two-player rosters, a dedicated pairing sequence, scoring, and fixed tiebreakers. Other formats now share a consistent tiebreaker settings layout.\n- Tournament viewing and management now share one page. Administrator actions stay visible; the common header shows format, team size, and pairing type. Pending results can be opened for review directly from match lists.\n- Completed tournaments open Results first, while Overview retains the final round's maps, missions, and match results. Improved warnings for assigning multiple pairs to one physical table and handling round pairings.\n- Player profiles have a compact statistics row. Personal details and account controls are grouped under Settings for the owner and administrators. Achievement display and sections have been updated.\n- Statistics now offers Kill Team autocomplete and correct all-time selection, with shorter Winrates section labels in both languages."
};

module.exports = {
  version: 114,
  name: "calendar_wtc_rollup_release_notes",
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
      if (/^##[ \t]+v?1\.6\.0(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
