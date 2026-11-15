module.exports = {
  version: 56,
  name: "training_progress",
  async up(client) {
    await client.query(`
      CREATE TABLE training_profiles (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
        stats JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(stats) = 'object'),
        completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE training_sessions (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bank_version TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('mixed', '1', '2', '3', '4')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
        cursor INTEGER NOT NULL DEFAULT 0 CHECK (cursor BETWEEN 0 AND 19),
        items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) = 20),
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        CHECK ((status = 'active') = (finished_at IS NULL))
      );
      CREATE UNIQUE INDEX training_one_active_session ON training_sessions(user_id) WHERE status = 'active';
      CREATE INDEX training_session_history ON training_sessions(user_id, started_at DESC, id);
    `);
  }
};
