const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.6 — 25 ноября 2026

- После создания турнира открывается обзор. На каждой вкладке организатор видит текущее состояние и следующее действие. По прямой ссылке он может вернуться и к своему черновику.
- После закрытия регистрации можно подготовить пары первого раунда. Если участников не хватает, турнир показывает, сколько игроков или составов нужно добавить, и открывает их список.
- В окне жеребьёвки видны соперники, количество пар и игрок, получивший бай. Сохранённые пары можно изменить до старта. При повторном открытии регистрации организатор подтверждает их сброс.
- В редакторе FAQ можно найти команду по части названия и добавить к вопросу несколько команд.`,
  en: `## 1.8.6 — 25 November 2026

- Creating a tournament now opens its overview. Each tab shows the organizer the current stage and next action. Organizers can also return directly to their draft using its link.
- After closing registration, organizers can prepare first-round pairings. If the field is too small, the tournament shows how many more players or rosters it needs and links to the entry list.
- The pairing editor shows opponents, the number of pairs and who receives the bye. Organizers can edit saved pairings before starting the tournament. Reopening registration asks for confirmation before clearing them.
- FAQ editors can search by part of a team name and add multiple teams to a question.`
};

module.exports = {
  version: 131,
  name: "tournament_organizer_release_notes",
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
      if (/^##[ \t]+v?1\.8\.6(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
