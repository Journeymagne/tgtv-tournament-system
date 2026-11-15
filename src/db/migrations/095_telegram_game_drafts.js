module.exports = {
  version: 95,
  name: 'telegram_game_drafts',
  async up(client) {
    await client.query(`CREATE TABLE tournaments.telegram_game_drafts (
      token TEXT PRIMARY KEY CHECK(token ~ '^[A-Za-z0-9_-]{16}$'),
      link_id BIGINT NOT NULL REFERENCES tournaments.telegram_links(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES accounts.users(id) ON DELETE CASCADE,
      chat_id BIGINT NOT NULL CHECK(chat_id>0),
      game_id INTEGER NOT NULL REFERENCES tournaments.games(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('submit','confirm','reject')),
      version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()+INTERVAL '30 minutes',
      result_revision TEXT NOT NULL,
      context_revision TEXT NOT NULL,
      state JSONB NOT NULL CHECK(jsonb_typeof(state)='object' AND octet_length(state::text)<=32768),
      UNIQUE(link_id,chat_id)
    );
    CREATE INDEX telegram_game_drafts_expiry ON tournaments.telegram_game_drafts(expires_at);
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_tournaments') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON tournaments.telegram_game_drafts TO kt_tournaments;
      END IF;
    END $$;`);
  }
};
