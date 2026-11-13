const { defaultPages } = require("../../domain/documentation");

// Keep this release copy fixed when later releases update the seed documents.
const releaseNotes = {
  "ru": "## 1.5.19 — 13 ноября 2026\n\n- В KnowThyKT добавлена отдельная вкладка [«Что нового»](/knowthykt#changelog) с историей изменений тренажёра и базы вопросов на русском и английском.\n- Опубликованы уточнённые формулировки, варианты ответов и английские переводы 13 вопросов с частыми ошибками. Все 7 вопросов про Portable Barricade исключены из тренировок.\n- История ответов, заработанный XP и звания сохранены. Прежние редакции вопросов сохраняют свои английские переводы.",
  "en": "## 1.5.19 — 13 November 2026\n\n- KnowThyKT now has a dedicated [What’s new](/knowthykt#changelog) tab with trainer and question-bank updates in Russian and English.\n- Published clearer wording, answer options and English translations for 13 questions with frequent mistakes. All 7 Portable Barricade questions are excluded from training.\n- Answer history, earned XP and titles are retained. Historical question revisions keep their matching English translations."
};

module.exports = {
  version: 91,
  name: "knowthykt_release_notes",
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
      if (/^##[ \t]+v?1\.5\.19(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
