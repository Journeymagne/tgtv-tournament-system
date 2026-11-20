const { defaultPages } = require("../../domain/documentation");

const releaseNotes = {
  ru: `## 1.8.4 — 20 ноября 2026

- Профили оружия сохраняются в аккаунте и доступны с разных устройств. Профиль можно удалить, а старые профили из этого браузера — перенести в аккаунт кнопкой «Перенести в мой аккаунт».
- В ручных профилях обычный и критический урон стоят рядом в колонке характеристик. Правила и перебросы собраны во второй колонке. Ситуация B в стрельбе по умолчанию свёрнута.
- Общие эффекты находятся в Advanced, фракционные — в отдельном разделе. Кнопка ⓘ открывает описание эффекта. На телефоне оба раздела по умолчанию свёрнуты и раскрываются независимо.
- Калькулятор учитывает Oubliex, Survival Instincts, Domino Field, Omnissiah’s Imperative, Sturdy, Undaunted Explorers, Critical Shot, Vicious Venom, Acts of Faith с Icon of Faith, Scry Protection, Aerial Agility и Crush у Ravener Wrecker.
- В серии из двух выстрелов Lethal и Piercing можно назначить первому или второму выстрелу. Just a Scratch отменяет обычный урон одного кубика. Mystic Scry Buff переименован в Skry Guidance.`,
  en: `## 1.8.4 — 20 November 2026

- Save weapon profiles to your account and use them on other devices. You can delete a saved profile or import profiles previously saved in this browser.
- Manual profiles show normal and critical damage together in the characteristics column. Rules and rerolls are in the second column. Shooting situation B starts collapsed.
- General effects are in Advanced, and faction effects have their own section. Select ⓘ to read what an effect does. On phones, both sections start collapsed and open independently.
- The calculator now supports Oubliex, Survival Instincts, Domino Field, Omnissiah’s Imperative, Sturdy, Undaunted Explorers, Critical Shot, Vicious Venom, Acts of Faith with Icon of Faith, Scry Protection, Aerial Agility and the Ravener Wrecker’s Crush.
- In a two-shot sequence, you can apply Lethal and Piercing to just the first or second shot. Just a Scratch cancels one die’s normal damage. Mystic Scry Buff is now called Skry Guidance.`
};

module.exports = {
  version: 129,
  name: "combat_profiles_release_notes",
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
      if (/^##[ \t]+v?1\.8\.4(?=[ \t\r\n]|$)/mi.test(current.markdown)) continue;
      const firstRelease = current.markdown.search(/^##[ \t]+v?\d+\.\d+\.\d+(?=[ \t\r\n]|$)/mi);
      const markdown = firstRelease < 0
        ? current.markdown + "\n\n" + note + "\n"
        : current.markdown.slice(0, firstRelease) + note + "\n\n" + current.markdown.slice(firstRelease);
      await client.query(`UPDATE tournaments.documentation_pages SET markdown=$2, version=version+1, updated_at=NOW()
        WHERE page_id='changelog' AND locale=$1`, [locale, markdown]);
    }
  }
};
