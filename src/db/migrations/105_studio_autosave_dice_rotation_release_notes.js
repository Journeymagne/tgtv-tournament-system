const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.35 — 17 ноября 2026\n\n- Исправлена гонка автосохранения в Студии: новые правки больше не подменяются устаревшим снимком и не создают лишние «копии правок» из-за сохранения в той же вкладке. Правки, сделанные во время подтверждения сохранения, остаются в текущем черновике.\n- Добавлен поворот логотипа на кубиках D6 на 0°, 90°, 180° и 270° в отдельном генераторе и Студии. Поворот сохраняется в оформлении и применяется к предпросмотру, PNG и новым экспортам Tabletop Simulator.",
  "en": "## 1.5.35 — 17 November 2026\n\n- Fixed a Studio autosave race: newer edits are no longer replaced by an older snapshot or turned into unnecessary recovery copies by saves in the same tab. Edits made while a save is being acknowledged stay in the current draft.\n- Added 0°, 90°, 180° and 270° dice logo rotation in the standalone D6 generator and Studio. The rotation is saved with the design and applied to previews, PNG files and new Tabletop Simulator exports."
};

module.exports = {
  version: 105,
  name: "studio_autosave_dice_rotation_release_notes",
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
      if (/^##[ \t]+v?1\.5\.35(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
