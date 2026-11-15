const achievements = require("../seeds/legacy-achievements.json");

// Stable source namespace: later exports from this bot must reuse it.
const LEGACY_SOURCE = "achievement-bot";

module.exports = {
  version: 24,
  name: "legacy_achievements",
  async up(client) {
    await client.query(`
      ALTER TABLE achievements
        ADD COLUMN IF NOT EXISTS legacy_source TEXT,
        ADD COLUMN IF NOT EXISTS legacy_id INTEGER
          CHECK (legacy_id > 0)
          CHECK ((legacy_source IS NULL) = (legacy_id IS NULL));
      CREATE UNIQUE INDEX IF NOT EXISTS achievements_legacy_identity
        ON achievements (legacy_source, legacy_id);
    `);

    // Never reuse the bot's IDs as local primary keys or overwrite local edits.
    // This catalog contains no ownership data and creates no awards.
    for (const achievement of achievements) {
      await client.query(`INSERT INTO achievements
        (name, emoji, description, kind, legacy_source, legacy_id)
        VALUES ($1, $2, $3, 'player', $4, $5)
        ON CONFLICT (legacy_source, legacy_id) DO NOTHING`,
      [achievement.name, achievement.emoji, achievement.description, LEGACY_SOURCE, achievement.id]);
    }
  }
};
