module.exports = {
  version: 44,
  name: "solo_replacements",
  async up(client) {
    await client.query(`
      ALTER TABLE tournament_participants ADD COLUMN is_proxy BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE tournament_participants ADD CONSTRAINT tournament_proxy_no_account CHECK (NOT is_proxy OR user_id IS NULL);
      ALTER TABLE tournament_matches ADD COLUMN participant_snapshots JSONB NOT NULL DEFAULT '{}'::jsonb;
      ALTER TABLE game_participants ADD COLUMN is_proxy BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE game_participants ADD CONSTRAINT game_proxy_no_account CHECK (NOT is_proxy OR user_id IS NULL);
      CREATE SEQUENCE tournament_proxy_number;
    `);
  }
};
