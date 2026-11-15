const replacements = [
  [
    "Проигравший ролл-офф выбирает одну из четырёх миссий раунда на любой стол. Победитель выбирает одну из оставшихся трёх на второй стол.",
    "Проигравший бросок выбирает одну из четырёх миссий раунда на любой стол. Победитель выбирает одну из оставшихся трёх на второй стол."
  ],
  [
    "Эта встреча сохранена по прежней версии правил. Капитаны выполняют ролл-офф; победитель — Attacker, проигравший — Defender. Этапа банов нет.",
    "Эта встреча сохранена по прежней версии правил. Капитаны выполняют бросок; победитель — Attacker, проигравший — Defender. Этапа банов нет."
  ]
];

module.exports = {
  version: 98,
  name: "pairing_instruction_terms",
  async up(client) {
    const { rows: [current] } = await client.query(`
      SELECT markdown FROM tournaments.documentation_pages
      WHERE page_id='pairing-instructions' AND locale='ru' FOR UPDATE
    `);
    if (!current) return;
    let markdown = current.markdown;
    for (const [previous, next] of replacements) markdown = markdown.replaceAll(previous, next);
    if (markdown === current.markdown) return;
    await client.query(`
      UPDATE tournaments.documentation_pages SET markdown=$1, version=version+1, updated_at=NOW()
      WHERE page_id='pairing-instructions' AND locale='ru'
    `, [markdown]);
  }
};
