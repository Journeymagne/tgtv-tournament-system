module.exports = {
  version: 96,
  name: 'telegram_interactive_delivery',
  async up(client) {
    await client.query(`CREATE TABLE tournaments.telegram_chat_screens (
      link_id BIGINT PRIMARY KEY REFERENCES tournaments.telegram_links(id) ON DELETE CASCADE,
      chat_id BIGINT NOT NULL UNIQUE CHECK(chat_id>0),
      generation BIGINT NOT NULL DEFAULT -1,
      target_message_id BIGINT CHECK(target_message_id>0),
      request_window TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      request_count INTEGER NOT NULL DEFAULT 0 CHECK(request_count BETWEEN 0 AND 91),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
    );
    ALTER TABLE tournaments.telegram_outbox
      ADD COLUMN delivery_method TEXT NOT NULL DEFAULT 'sendMessage' CHECK(delivery_method IN ('sendMessage','editMessageText')),
      ADD COLUMN screen_generation BIGINT,
      ADD COLUMN target_message_id BIGINT CHECK(target_message_id>0),
      ADD COLUMN game_id INTEGER,
      ADD COLUMN access_scope JSONB NOT NULL DEFAULT '{"gameIds":[],"pairingIds":[]}'
        CHECK(jsonb_typeof(access_scope)='object' AND jsonb_typeof(access_scope->'gameIds')='array'
          AND jsonb_typeof(access_scope->'pairingIds')='array' AND jsonb_array_length(access_scope->'gameIds')<=6
          AND jsonb_array_length(access_scope->'pairingIds')<=3),
      ADD COLUMN delivery_started_at TIMESTAMPTZ;
    ALTER TABLE tournaments.telegram_outbox ADD CONSTRAINT telegram_screen_link
      CHECK(screen_generation IS NULL OR (link_id IS NOT NULL AND notification IS NULL));
    CREATE INDEX telegram_outbox_interactive ON tournaments.telegram_outbox(next_attempt_at,id)
      WHERE notification IS NULL AND state IN ('pending','processing');
    CREATE INDEX telegram_outbox_chat_turn ON tournaments.telegram_outbox(chat_id,delivery_started_at DESC,id DESC)
      WHERE delivery_started_at IS NOT NULL;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_tournaments') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON tournaments.telegram_chat_screens TO kt_tournaments;
      END IF;
    END $$;`);
  }
};
