const { defaultPages } = require("../../domain/documentation");

// Frozen release text; preserve previously edited documentation.
const releaseNotes = {
  "ru": "## 1.5.38 — 17 ноября 2026\r\n\r\n- В калькуляторе ближнего боя для каждого правила, включая NicheAbility, можно выбрать применение в каждом файте или один раз на всю серию. Настройки независимы для двух бойцов.\r\n- В калькуляторе стрельбы добавлен такой же выбор для правил атаки и защиты в обеих ситуациях. Неиспользованные срабатывающие эффекты остаются доступными в следующей стрельбе; сохраняется общий лимит Saintly Relics и учитывается FNP.\r\n- Частота сохраняется в ссылках, сценариях и профилях оружия. Старые настройки продолжают работать как раньше. Для постоянных правил одноразовый режим ограничивает действие первым файтом или первой стрельбой; пояснения доступны на русском и английском.",
  "en": "## 1.5.38 — 17 November 2026\r\n\r\n- The melee calculator now lets each rule, including NicheAbility, apply in every fight or once across the series. Each fighter has independent settings.\r\n- The shooting calculator offers the same choice for attack and defence rules in both situations. Unused triggered effects remain available for later shots, while the shared Saintly Relics limit and FNP are preserved.\r\n- Frequency settings are saved in links, scenarios and weapon profiles. Existing settings keep their previous behaviour. For persistent rules, once mode limits the effect to the first fight or shot; explanations are available in Russian and English."
};

module.exports = {
  version: 109,
  name: "calculator_effect_frequency_release_notes",
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
      if (/^##[ \t]+v?1\.5\.38(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;

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
