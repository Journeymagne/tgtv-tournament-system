const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.6.1 — 18 ноября 2026\n\n- Организаторы с правом создания турниров теперь могут добавлять события в Календарь.\n- В «Администрирование → Игроки и команды» добавлена вкладка «Администраторы»: поиск пользователей со специальными правами, глобальные роли и назначения организаторов и судей в отдельных турнирах.\n- Любой администратор может выдавать и менять права, назначать судей и передавать организацию турнира. Снять статус администратора может только суперадминистратор.",
  "en": "## 1.6.1 — 18 November 2026\n\n- Tournament organizers with tournament-creation permission can now add events to the Calendar.\n- Administration → Players and teams now includes an Administrators tab: search users with special permissions and manage global roles, tournament organizers and judges.\n- Any administrator can grant and edit permissions, assign judges and transfer tournament ownership. Only the super administrator can remove administrator status."
};

module.exports = {
  version: 116,
  name: "calendar_organizer_creation_release_notes",
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
      if (/^##[ \t]+v?1\.6\.1(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
