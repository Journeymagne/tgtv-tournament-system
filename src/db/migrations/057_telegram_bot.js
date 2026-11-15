module.exports = {
  version: 57,
  name: "telegram_bot",
  async up(client) {
    await client.query(`
      CREATE TABLE telegram_links (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        telegram_id BIGINT NOT NULL UNIQUE CHECK (telegram_id > 0),
        chat_id BIGINT NOT NULL CHECK (chat_id = telegram_id),
        username TEXT NOT NULL DEFAULT '', display_name TEXT NOT NULL DEFAULT '',
        locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru','en')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE, blocked BOOLEAN NOT NULL DEFAULT FALSE,
        preferences JSONB NOT NULL DEFAULT '{"pairings":true,"results":true,"invitations":true,"tournaments":true}',
        linked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        last_sent_at TIMESTAMPTZ
      );
      CREATE TABLE telegram_link_tokens (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        telegram_id BIGINT, username TEXT, display_name TEXT, claimed_at TIMESTAMPTZ
      );
      CREATE TABLE telegram_updates (
        update_id BIGINT PRIMARY KEY, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE telegram_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE telegram_events (
        id BIGSERIAL PRIMARY KEY, entity TEXT NOT NULL, entity_id INTEGER NOT NULL,
        transaction_id BIGINT NOT NULL DEFAULT txid_current(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), processed_at TIMESTAMPTZ,
        UNIQUE(entity,entity_id,transaction_id)
      );
      CREATE INDEX telegram_events_pending ON telegram_events(id) WHERE processed_at IS NULL;
      CREATE TABLE telegram_outbox (
        id BIGSERIAL PRIMARY KEY,
        link_id BIGINT REFERENCES telegram_links(id) ON DELETE CASCADE,
        chat_id BIGINT NOT NULL, notification JSONB, payload JSONB,
        dedup_key TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','sent','cancelled','failed')),
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_until TIMESTAMPTZ, last_error TEXT, message_id BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ
      );
      CREATE INDEX telegram_outbox_pending ON telegram_outbox(next_attempt_at,id) WHERE state IN ('pending','processing');

      -- Signals commit together with the actual tournament mutation, even when
      -- nobody opens the site's inbox. Delivery resolves CURRENT permissions/data.
      CREATE FUNCTION telegram_signal() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE entity_name TEXT := TG_TABLE_NAME; source_id INTEGER := NEW.id;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM telegram_links) THEN RETURN NEW; END IF;
        IF TG_TABLE_NAME IN ('game_participants', 'tournament_matches', 'tournament_team_match_games') THEN
          entity_name := 'games'; source_id := NEW.game_id;
        ELSIF TG_TABLE_NAME = 'tournament_tables' THEN
          INSERT INTO telegram_events(entity,entity_id)
          SELECT 'games', game_id FROM tournament_matches WHERE table_id=NEW.id AND game_id IS NOT NULL
          UNION SELECT 'games', game_id FROM tournament_team_match_games WHERE table_id=NEW.id
          ON CONFLICT(entity,entity_id,transaction_id) DO NOTHING;
          RETURN NEW;
        ELSIF TG_TABLE_NAME = 'tournaments' THEN
          IF NEW.status <> 'in_progress' THEN RETURN NEW; END IF;
          IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;
        END IF;
        IF source_id IS NOT NULL THEN
          INSERT INTO telegram_events(entity,entity_id) VALUES(entity_name,source_id)
          ON CONFLICT(entity,entity_id,transaction_id) DO NOTHING;
        END IF;
        RETURN NEW;
      END $$;
    `);
    for (const table of ["challenges", "player_team_invitations", "tournaments", "games", "game_participants", "tournament_matches", "tournament_team_matches", "tournament_team_match_games", "tournament_tables"]) {
      await client.query(`CREATE TRIGGER telegram_signal AFTER INSERT OR UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION telegram_signal()`);
    }
  }
};
