const { defaultPages } = require("../../domain/documentation");

// Keep this release copy fixed when later releases update the seed documents.
const releaseNotes = {
  ru: `## 1.5.15 — 11 ноября 2026

- Добавлен отдельный [сервис тирлистов](/tierlist) с тирами S / A / B / C / F и нижней областью для распределения 48 миниатюр команд с прозрачным фоном.
- Тирлисты можно сохранять в профиле KT Companion с выбором сезона. Доступны личные сохранения и черновик в браузере.
- При выборе команды показываются её логотип и статистика последнего сезона: количество игр, винрейт, топ-3 вторички и топ-3 игрока.
- Поддерживаются светлая и тёмная темы, мобильные экраны, русский и английский языки.`,
  en: `## 1.5.15 — 11 November 2026

- Added a standalone [tier list service](/tierlist), with S / A / B / C / F tiers and an unranked pool of 48 team miniatures with transparent backgrounds.
- Save tier lists to your KT Companion profile with a selected season. Personal saved lists and a browser draft are available.
- Selecting a team shows its logo and latest-season statistics: games, win rate, top 3 Tac Ops and top 3 players.
- Supports light and dark themes, mobile screens, Russian and English.`
};

module.exports = {
  version: 88,
  name: "tierlist_release_notes",
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
      if (/^##[ \t]+v?1\.5\.15(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
