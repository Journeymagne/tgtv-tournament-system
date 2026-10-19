const SOURCES = ['tournaments','studio','faq'];
module.exports = {
  version: 59, name: 'notification_events',
  async up(client) {
    for (const schema of SOURCES) {
      await client.query(`
        CREATE TABLE ${schema}.notification_messages (
          user_id INTEGER NOT NULL REFERENCES accounts.users(id) ON DELETE CASCADE,
          notification_id TEXT NOT NULL, payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
          PRIMARY KEY(user_id,notification_id));
        CREATE TABLE ${schema}.notification_outbox (
          id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL, notification_id TEXT NOT NULL,
          operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')), payload JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
        CREATE FUNCTION ${schema}.queue_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
          SET search_path = pg_catalog, ${schema}, pg_temp AS $$
        BEGIN
          IF TG_OP='DELETE' THEN
            INSERT INTO notification_outbox(user_id,notification_id,operation) VALUES(OLD.user_id,OLD.notification_id,'delete');
            RETURN OLD;
          END IF;
          IF TG_OP='INSERT' OR NEW.payload IS DISTINCT FROM OLD.payload THEN
            INSERT INTO notification_outbox(user_id,notification_id,operation,payload)
            VALUES(NEW.user_id,NEW.notification_id,'upsert',NEW.payload);
          END IF;
          RETURN NEW;
        END $$;
        REVOKE ALL ON FUNCTION ${schema}.queue_notification() FROM PUBLIC;
        INSERT INTO ${schema}.notification_messages(user_id,notification_id,payload,created_at,read_at)
          SELECT user_id,notification_id,payload,created_at,read_at FROM notifications.notification_inbox_items
          WHERE ${schema === 'studio' ? "payload->>'type' IN ('studio_review','studio_comment')" : schema === 'tournaments' ? "payload->>'type' NOT IN ('studio_review','studio_comment')" : 'FALSE'};
        CREATE TRIGGER queue_notification AFTER INSERT OR UPDATE OR DELETE ON ${schema}.notification_messages
          FOR EACH ROW EXECUTE FUNCTION ${schema}.queue_notification();
      `);
    }
    await client.query(`
      CREATE TABLE tournaments.notification_recipients (
        user_id INTEGER PRIMARY KEY REFERENCES accounts.users(id) ON DELETE CASCADE,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      INSERT INTO tournaments.notification_recipients(user_id) SELECT id FROM accounts.users;
      CREATE FUNCTION tournaments.queue_notification_recipients() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = pg_catalog, tournaments, accounts, pg_temp AS $$
      DECLARE row_data JSONB := to_jsonb(NEW); event_tournament INTEGER; event_game INTEGER;
      BEGIN
        IF TG_TABLE_NAME='challenges' THEN
          INSERT INTO notification_recipients(user_id) SELECT NEW.to_user_id WHERE NEW.to_user_id IS NOT NULL
            ON CONFLICT(user_id) DO UPDATE SET changed_at=NOW();
        ELSIF TG_TABLE_NAME='player_team_invitations' THEN
          INSERT INTO notification_recipients(user_id) SELECT NEW.invitee_user_id WHERE NEW.invitee_user_id IS NOT NULL
            ON CONFLICT(user_id) DO UPDATE SET changed_at=NOW();
        ELSE
          event_game := CASE WHEN TG_TABLE_NAME='games' THEN NEW.id ELSE (row_data->>'game_id')::integer END;
          event_tournament := CASE WHEN TG_TABLE_NAME='tournaments' THEN NEW.id ELSE (row_data->>'tournament_id')::integer END;
          INSERT INTO notification_recipients(user_id)
            SELECT DISTINCT id FROM accounts.users WHERE id IN (
              SELECT unnest(player_ids) FROM games WHERE id=event_game
              UNION SELECT user_id FROM game_participants WHERE game_id=event_game
              UNION SELECT user_id FROM tournament_participants WHERE tournament_id=event_tournament
              UNION SELECT m.user_id FROM tournament_team_roster_members m JOIN tournament_team_rosters r ON r.id=m.roster_id WHERE r.tournament_id=event_tournament
              UNION SELECT captain_user_id FROM tournament_team_rosters WHERE tournament_id=event_tournament
            ) ORDER BY id ON CONFLICT(user_id) DO UPDATE SET changed_at=NOW();
        END IF;
        RETURN NEW;
      END $$;
      REVOKE ALL ON FUNCTION tournaments.queue_notification_recipients() FROM PUBLIC;
    `);
    for (const table of ['challenges','player_team_invitations','games','game_participants','tournaments','tournament_participants','tournament_matches','tournament_team_rosters','tournament_team_matches','tournament_team_match_games','tournament_tables']) {
      await client.query(`CREATE TRIGGER queue_notification_recipients AFTER INSERT OR UPDATE ON tournaments.${table}
        FOR EACH ROW EXECUTE FUNCTION tournaments.queue_notification_recipients()`);
    }
    await client.query(`
      CREATE FUNCTION studio.prune_notifications() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = pg_catalog, studio, pg_temp AS $$
      BEGIN
        DELETE FROM notification_messages n WHERE n.payload->>'type'='studio_comment' AND NOT EXISTS(
          SELECT 1 FROM studio_comments c JOIN studio_projects p USING(publication_id)
          WHERE n.notification_id='studio_comment:'||c.id::text AND c.deleted_at IS NULL AND c.hidden_at IS NULL
            AND p.deleted_at IS NULL AND p.published IS NOT NULL);
        UPDATE notification_messages n SET payload=jsonb_set(n.payload,'{authorName}',to_jsonb('Удалённый пользователь'::text))
          FROM studio_comments c WHERE n.notification_id='studio_comment:'||c.id::text AND c.author_id IS NULL
            AND n.payload->>'authorName'<>'Удалённый пользователь';
        DELETE FROM notification_messages n WHERE n.payload->>'type'='studio_review' AND NOT EXISTS(
          SELECT 1 FROM studio_reviews r JOIN studio_projects p USING(publication_id)
          WHERE n.notification_id='studio_review:'||r.id::text AND r.deleted_at IS NULL AND r.hidden_at IS NULL
            AND p.published IS NOT NULL AND p.deleted_at IS NULL AND p.owner_id=n.user_id AND r.author_id<>p.owner_id);
        RETURN NULL;
      END $$;
      REVOKE ALL ON FUNCTION studio.prune_notifications() FROM PUBLIC;
    `);
    for (const table of ['studio_comments','studio_reviews','studio_projects']) await client.query(`
      CREATE TRIGGER prune_notifications AFTER UPDATE OR DELETE ON studio.${table}
      FOR EACH STATEMENT EXECUTE FUNCTION studio.prune_notifications()`);
    await client.query(`UPDATE notifications.notification_inbox_items SET payload=jsonb_set(payload,'{href}',to_jsonb('/tournament'||(payload->>'href')))
      WHERE payload->>'href' LIKE '#/%'`);
  }
};
