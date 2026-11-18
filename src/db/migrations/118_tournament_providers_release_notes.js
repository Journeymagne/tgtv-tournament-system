const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.7.0 — 18 ноября 2026\n\n- В «Турнирах» появилась вкладка «Организации»: провайдеры турниров с названием, логотипом, городом и описанием, составом организаторов и судей.\n- Создатель организации становится главным организатором и приглашает игроков с выбранной ролью. Организаторы создают турниры и события календаря от имени организации; судьи ведут её ивенты. Администраторы управляют любой организацией и её составом.\n- На странице организации доступны сворачиваемые списки текущих, будущих и прошедших ивентов. Турнир и связанный анонс не дублируются; в карточках и календаре показана организация-провайдер.\n- Добавлены передача главной роли, выход из организации и архивирование. Права обновляются после изменения членства, а отдельные назначения судьёй турнира управляются независимо.\n- Интерфейс поддерживает обе темы и языки, мобильные экраны; исправлено выравнивание фильтров организаций и сохранение времени анонса при работе организаторов из разных часовых поясов.",
  "en": "## 1.7.0 — 18 November 2026\n\n- Tournaments now includes an Organizations tab: tournament providers with a name, logo, home city, description, and a roster of organizers and judges.\n- The creator becomes the chief organizer and invites players with a chosen role. Organizers create tournaments and calendar events for their organization; judges run its events. Platform administrators can manage every organization and its membership.\n- Organization profiles have collapsible current, upcoming and past event lists. Linked tournaments and announcements appear once, and event cards and the calendar identify their provider.\n- Added ownership transfer, leaving and archiving organizations. Membership changes update access, while explicit tournament judge appointments remain independently manageable.\n- The interface supports both themes and languages and mobile screens. Organization filters are aligned, and announcement times are preserved when organizers work across time zones."
};

module.exports = {
  version: 118,
  name: "tournament_providers_release_notes",
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
      if (/^##[ \t]+v?1\.7\.0(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
