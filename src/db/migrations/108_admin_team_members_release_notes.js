const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.37 — 17 ноября 2026\r\n\r\n- Администратор может добавить существующего игрока в активную команду через поиск во вкладке управления. Игрок сразу попадает в состав без принятия приглашения; прежние приглашения закрываются, история участия сохраняется.\r\n- Текущие участники исключены из результатов поиска для добавления. Повторное добавление запрещено, действие администратора записывается в журнал.",
  "en": "## 1.5.37 — 17 November 2026\r\n\r\n- Administrators can add an existing player to an active team using player search in the management tab. The player joins immediately without accepting an invitation; pending invitations are closed and membership history is preserved.\r\n- Current members are excluded from addition search results. Duplicate membership is prevented, and the administrator's action is recorded in the audit log."
};

module.exports = {
  version: 108,
  name: "admin_team_members_release_notes",
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
      if (/^##[ \t]+v?1\.5\.37(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
