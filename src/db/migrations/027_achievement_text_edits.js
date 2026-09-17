module.exports = {
  version: 27,
  name: "achievement_text_edits",
  async up(client) {
    await client.query("ALTER TABLE achievements ADD COLUMN IF NOT EXISTS text_edited BOOLEAN NOT NULL DEFAULT FALSE");
  }
};
