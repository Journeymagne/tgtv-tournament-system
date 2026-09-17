module.exports = {
  version: 22,
  name: "team_pairing_history",
  async up(client) {
    await client.query(`
      ALTER TABLE tournament_team_matches
        ADD COLUMN IF NOT EXISTS pairing_history JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS pairing_revision INTEGER NOT NULL DEFAULT 0;
    `);
  }
};
