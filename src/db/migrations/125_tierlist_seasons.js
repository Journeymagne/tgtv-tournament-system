const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.1 — 19 ноября 2026

- В тирлистах кнопка «Перемешать» меняет порядок всех команд в нижнем пуле. «Отменить ход» возвращает прежний порядок.
- В карточке киллтима можно выбрать сезон для числа игр, винрейта и топа вторичек. Выбранный сезон действует и при переходе к другой команде. Рейтинг игроков охватывает все сезоны.
- Сезон 2026 Q4 теперь называется «2026 Q4 Dataslate».`,
  en: `## 1.8.1 — 19 November 2026

- In tier lists, Shuffle reorders all unranked teams in the pool. Undo move restores their previous order.
- Choose a season in a kill team's statistics panel to see its games, win rate and top Tac Ops. The selection carries over when you open another team. Player rankings cover all seasons.
- The 2026 Q4 season is now called “2026 Q4 Dataslate”.`
};

module.exports = {
  version: 125,
  name: "tierlist_seasons",
  async up(client) {
    await client.query(`UPDATE tierlists.tierlist_seasons SET label='2026 Q4 Dataslate'
      WHERE id='2026-q4-dataslate' AND label='2026 Q4'`);

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
      if (/^##[ \t]+v?1\.8\.1(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
