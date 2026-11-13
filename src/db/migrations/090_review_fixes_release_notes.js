const { defaultPages } = require("../../domain/documentation");

// Keep this release copy fixed when later releases update the seed documents.
const releaseNotes = {
  "ru": "## 1.5.18 — 13 ноября 2026\n\n- Составы в превью командного паринга выстроены по фактическим матчапам и совпадают с карточками игр.\n- Исправлены сохранение результатов турниров, пересчёт рейтинга и порядок швейцарских парингов, включая снятых игроков, замены и пропуски тура. Для швейцарских турниров доступен режим By TP.\n- Studio надёжнее восстанавливает несохранённые изменения между вкладками и после перезапуска. При обновлении опубликованной версии текст ревью сохраняется, а переход на новую версию требует подтверждения.\n- Исправлены смена аккаунта в уведомлениях, отметки прочтения и повторные решения модерации FAQ. Устранены гонки прогресса KnowThyKT и регистрации одинаковых имён.\n- Уточнены английские формулировки вопросов учебного раздела.",
  "en": "## 1.5.18 — 13 November 2026\n\n- Team pairing previews align roster rows with the actual matchups and game cards.\n- Fixed tournament result submission, rating recalculation and Swiss pairing order, including removed players, replacements and byes. Swiss tournaments also offer the By TP pairing mode.\n- Studio more reliably restores unsaved edits across tabs and restarts. Review text survives a publication version change, and reviewing the new version requires confirmation.\n- Fixed account changes in notifications, read markers and repeated FAQ moderation decisions. Resolved KnowThyKT progress races and concurrent registrations with the same name.\n- Improved English wording in training questions."
};

module.exports = {
  version: 90,
  name: "review_fixes_release_notes",
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
      if (/^##[ \t]+v?1\.5\.18(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
