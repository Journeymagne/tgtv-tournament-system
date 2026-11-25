const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.5 — 25 ноября 2026

- В турнирах с настраиваемыми тайбрейкерами появился критерий «Сумма Праймари». Он складывает бонусы Primary за сыгранные партии игрока или команды. Большая сумма даёт преимущество при равенстве по предыдущим критериям.
- В полях выбора команды можно ввести часть названия и выбрать подходящий вариант из подсказок по алфавиту. В форме результата доступны команды, заявленные игроком.
- При генерации расстановки для стола организатору сначала предлагаются свободные варианты из того же набора Killzone. Генератор учитывает и несохранённые изменения на соседних столах. Вручную можно выбрать повтор.
- В Telegram очки вводятся в порядке Crit Op, Tac Op, Kill Op, затем выбирается Primary Op.`,
  en: `## 1.8.5 — 25 November 2026

- Tournaments with configurable standings tiebreakers now offer Total Primary. It adds the Primary bonuses earned by a player or team. A higher total breaks a tie after earlier criteria.
- Type part of a team name to see matching options in alphabetical order. When reporting a tournament result, choose from the player's registered teams.
- Table layout generation now suggests unused layouts from the same Killzone set first, including edits on other tables that have yet to be saved. Organizers can still select repeated layouts manually.
- Telegram now asks for Crit Op, Tac Op and Kill Op scores in that order, followed by the Primary Op selection.`
};

module.exports = {
  version: 130,
  name: "tournament_options_release_notes",
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
      if (/^##[ \t]+v?1\.8\.5(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
