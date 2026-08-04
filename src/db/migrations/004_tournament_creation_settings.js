const SCHEMA = `
  ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS rules_link TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS single_elimination_size INTEGER;

  ALTER TABLE tournaments
    ALTER COLUMN game_system SET DEFAULT 'Warhammer 40k Kill Team';

  UPDATE tournaments
  SET single_elimination_size = 8
  WHERE format = 'single_elimination'
    AND single_elimination_size IS NULL;

  ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS tournaments_single_elimination_size_check;

  ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_single_elimination_size_check CHECK (
      format <> 'single_elimination' OR single_elimination_size IN (8, 16, 32, 64)
    );
`;

module.exports = {
  version: 4,
  name: "tournament_creation_settings",
  async up(client) {
    await client.query(SCHEMA);
  }
};
