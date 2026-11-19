const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.3 — 20 ноября 2026

- В тирлистах команды перемещаются только перетаскиванием. Нажмите на фигурку, чтобы открыть статистику. На сенсорном экране удержите фигурку и перетащите её в нужный тир или обратно в пул.
- Кнопка «Скачать JPEG» сохраняет название, сезон и все пять тиров в одном изображении. Экспорт учитывает тему, размер фигурок и выбранный режим показа названий команд.`,
  en: `## 1.8.3 — 20 November 2026

- Drag teams to move them in a tier list. Click a miniature to open its statistics. On a touchscreen, touch and hold the miniature, then drag it to a tier or back to the pool.
- Download JPEG saves the title, season and all five tiers in one image. The export uses your theme, miniature size and team name settings.`
};

module.exports = {
  version: 127,
  name: "tierlist_drag_jpeg_release_notes",
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
      if (/^##[ \t]+v?1\.8\.3(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
