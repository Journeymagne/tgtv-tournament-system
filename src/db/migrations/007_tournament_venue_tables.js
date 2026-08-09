const SCHEMA = `
  ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS season_id TEXT NOT NULL DEFAULT '2026-q2-dataslate',
    ADD COLUMN IF NOT EXISTS venue_mode TEXT NOT NULL DEFAULT 'tts';

  ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS tournaments_venue_mode_check;

  ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_venue_mode_check CHECK (
      venue_mode IN ('tts','irl')
    );

  CREATE TABLE IF NOT EXISTS tournament_tables (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    killzone TEXT NOT NULL DEFAULT '',
    deployment INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (tournament_id, table_number),
    CONSTRAINT tournament_tables_number_check CHECK (table_number >= 1),
    CONSTRAINT tournament_tables_deployment_check CHECK (deployment IS NULL OR deployment BETWEEN 1 AND 6)
  );

  ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS table_id INTEGER REFERENCES tournament_tables(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mission JSONB;

  CREATE INDEX IF NOT EXISTS idx_tournament_tables_tournament_id
    ON tournament_tables(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_matches_table_id
    ON tournament_matches(table_id);
`;

module.exports = {
  version: 7,
  name: "tournament_venue_tables",
  async up(client) {
    await client.query(SCHEMA);
  }
};
