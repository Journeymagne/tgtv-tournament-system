const seed = require("../seeds/legacy-achievements.json");
const { tournamentNumber } = require("../../domain/achievements");
module.exports = {
  version: 26,
  name: "achievement_titles",
  async up(client) {
    await client.query(`ALTER TABLE achievements
      ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'achievement' CHECK (category IN ('achievement','title')),
      ADD COLUMN IF NOT EXISTS tournament_number INTEGER CHECK (tournament_number >= 0),
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      CREATE TABLE IF NOT EXISTS achievement_award_members (
        id SERIAL PRIMARY KEY,
        award_id INTEGER NOT NULL REFERENCES achievement_awards(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name_snapshot TEXT NOT NULL,
        UNIQUE (award_id, user_id)
      );`);
    for (const row of seed.filter((row) => /победител/i.test(row.description))) {
      await client.query(`UPDATE achievements SET category='title', tournament_number=$1
        WHERE legacy_source='achievement-bot' AND legacy_id=$2`, [tournamentNumber(row.name, row.description), row.id]);
    }
    const { rows } = await client.query("SELECT id, description FROM achievements WHERE tournament_id IS NOT NULL");
    for (const row of rows) await client.query("UPDATE achievements SET category='title', tournament_number=$1 WHERE id=$2", [tournamentNumber(row.description), row.id]);
  }
};
