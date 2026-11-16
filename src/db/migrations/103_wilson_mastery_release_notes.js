const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.32 — 16 ноября 2026\n\n- Добавлен сезон 2026 Q4 с 9 ноября: результаты с этой даты учитываются в новом сезоне, включая игры турниров, начатых раньше.\n- В лучших игроках киллтима появился балл Уилсона за всё время. Он учитывает долю побед и количество игр; список по умолчанию отсортирован по этому баллу и показывает топ-5 игроков. Последние игры в карточке ограничены пятью матчами выбранного сезона.\n- Добавлены автоматические личные ачивки за владение киллтимом: «Опытный» — 50, «Знаток» — 60, «Мастер» — 70 баллов Уилсона. Каждая считается по всей истории игр на киллтиме и отзывается при снижении балла ниже порога.\n- В профиле показываются только полученные учебные ачивки команд. Кнопки и статусы карточек игр располагаются компактнее и переносятся при нехватке места.",
  "en": "## 1.5.32 — 16 November 2026\n\n- Added the 2026 Q4 season starting on November 9. Results from that date count toward the new season, including games from tournaments that started earlier.\n- Faction best-player lists now show an all-time Wilson score, accounting for win rate and sample size. The default order is highest Wilson score first, limited to five players. Recent games in faction details are limited to the latest five matches of the selected season.\n- Added automatic personal faction achievements: Experienced at 50, Connoisseur at 60 and Master at 70 Wilson points. Each uses the player's entire history on that faction and is revoked when the score drops below its threshold.\n- Profiles show only earned team training achievements. Game-card actions and statuses use a more compact layout and wrap when space is limited."
};

module.exports = {
  version: 103,
  name: "wilson_mastery_release_notes",
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
      if (/^##[ \t]+v?1\.5\.32(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
