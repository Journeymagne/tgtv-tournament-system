module.exports = {
  version: 87,
  name: 'tierlists',
  async up(client) {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS tierlists;
      CREATE TABLE tierlists.tierlist_seasons (
        id TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
        label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
        starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, position INTEGER NOT NULL,
        CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
      );
      INSERT INTO tierlists.tierlist_seasons(id,label,starts_at,ends_at,position) VALUES
        ('2026-q2-dataslate','2026 Q2 Dataslate',NULL,'2026-09-26T00:00:00+04:00',1),
        ('2026-q3-dataslate','2026 Q3 Dataslate','2026-09-26T00:00:00+04:00',NULL,2);
      CREATE TABLE tierlists.saved_tierlists (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES accounts.users(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
        season_id TEXT NOT NULL REFERENCES tierlists.tierlist_seasons(id),
        rankings JSONB NOT NULL CHECK (jsonb_typeof(rankings)='object' AND octet_length(rankings::TEXT)<=32768),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX saved_tierlists_user_updated_idx ON tierlists.saved_tierlists(user_id,updated_at DESC,id DESC);
      CREATE INDEX saved_tierlists_user_season_idx ON tierlists.saved_tierlists(user_id,season_id,updated_at DESC,id DESC);
    `);
  }
};
