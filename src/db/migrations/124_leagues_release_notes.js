const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.8.0 — 19 ноября 2026\n\n- В разделе «Турниры» появилась вкладка «Лиги». Из карточки турнира можно открыть итоги каждой лиги, в которую он входит.\n- Личный зачёт сохраняет выступления за игроком из Реестра при смене ника. В строке видны количество ивентов, сыгранные киллтимы и вклад каждого турнира. В зачёте организаций очки всех составов складываются, а каждый парный или командный турнир учитывается один раз.\n- Организатор может подключить прошедшие турниры, выбрать для каждого зачёта сумму ТП или очки за место, скопировать тай-брейки из турнира или задать свои. Предпросмотр показывает изменения до сохранения.\n- Обновлены вкладки, навигация с клавиатуры и работа меню, таблиц и фильтров FAQ на узких экранах. Команды управления турниром собраны в «Настройках», а список ролей показывает действующих руководителей организаций.",
  "en": "## 1.8.0 — 19 November 2026\n\n- Tournaments now has a Leagues tab. A tournament page links to the standings for each league it belongs to.\n- Individual standings keep a registry player's results together when their nickname changes. Each row shows event count, kill teams and a breakdown by tournament. Organization standings add points from every roster and count each doubles or team tournament once.\n- Organizers can link past tournaments, award tournament points or points by place in each set of standings, and copy or customize tie-breakers. A preview shows how the standings will change before saving.\n- Updated tabs, keyboard navigation, menus, tables and FAQ filters on narrow screens. Tournament management actions are grouped under Settings, and the roles list shows current organization heads."
};

module.exports = {
  version: 124,
  name: "leagues_release_notes",
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
      if (/^##[ \t]+v?1\.8\.0(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
