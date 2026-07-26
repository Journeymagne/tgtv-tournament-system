const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    name_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_data TEXT,
    register_nickname TEXT,
    telegram_contact TEXT,
    challenge_credits JSONB,
    rating INTEGER NOT NULL DEFAULT 1000,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    game_id INTEGER,
    share_token TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
    player_ids INTEGER[] NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    pending_result JSONB,
    result JSONB,
    elo JSONB
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    screen TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_challenges_from_user_id ON challenges(from_user_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_to_user_id ON challenges(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
  CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
  CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);
`;

const PATCHES = [
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS register_nickname TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_contact TEXT",
  "ALTER TABLE users ADD COLUMN IF NOT EXISTS challenge_credits JSONB",
  "ALTER TABLE challenges ADD COLUMN IF NOT EXISTS share_token TEXT",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_share_token ON challenges(share_token) WHERE share_token IS NOT NULL",
  "ALTER TABLE games ADD COLUMN IF NOT EXISTS pending_result JSONB",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open'",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ",
  "ALTER TABLE feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ",
  "ALTER TABLE games ADD COLUMN IF NOT EXISTS elo JSONB",
  "CREATE INDEX IF NOT EXISTS idx_games_player_ids ON games USING GIN (player_ids)"
];

module.exports = {
  version: 1,
  name: "baseline",
  async up(client) {
    await client.query(SCHEMA);
    for (const statement of PATCHES) {
      await client.query(statement);
    }
  }
};
