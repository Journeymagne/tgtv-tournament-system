const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.29 — 16 ноября 2026\n\n- Возвращена обычная ширина турнирного интерфейса. Если открытой таблице не хватает места для столбцов, рабочая область автоматически расширяется в пределах экрана, чтобы уменьшить или убрать прокрутку вбок.\n- Ширина пересчитывается при переключении разделов, изменении таблицы и размера окна. Страницы без широких таблиц сохраняют привычные поля; на узких экранах статистика команды по-прежнему показывает показатели в карточках.",
  "en": "## 1.5.29 — 16 November 2026\n\n- Restored the usual tournament interface width. When an open table needs more room for its columns, the workspace expands within the screen to reduce or remove horizontal scrolling.\n- Width adapts when switching sections, changing a table or resizing the window. Pages without wide tables keep their usual margins; narrow-screen faction statistics continue to show metrics in labeled cards."
};

module.exports = {
  version: 99,
  name: "conditional_table_width_release_notes",
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
      if (/^##[ \t]+v?1\.5\.29(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
