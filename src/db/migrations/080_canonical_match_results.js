module.exports = {
  version: 80,
  name: 'canonical_match_results',
  async up(client) {
    await client.query(`
      LOCK TABLE tournaments.tournament_matches,tournaments.games,tournaments.game_participants IN SHARE ROW EXCLUSIVE MODE;
      DROP TRIGGER tournament_match_identity_guard ON tournaments.tournament_matches;
      -- One-time recovery evidence, not an application result store. Conflicting
      -- values are never silently discarded or merged over a canonical result.
      CREATE TABLE tournaments.result_migration_archive (
        match_id INTEGER PRIMARY KEY, match_before JSONB NOT NULL, game_before JSONB,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      INSERT INTO tournaments.result_migration_archive(match_id,match_before,game_before)
      SELECT m.id,to_jsonb(m),to_jsonb(g) FROM tournaments.tournament_matches m
      LEFT JOIN tournaments.games g ON g.id=m.game_id
      WHERE (m.result IS NOT NULL OR m.pending_result IS NOT NULL OR m.elo IS NOT NULL OR m.submitted_by_user_id IS NOT NULL)
        AND (g.id IS NULL OR m.result IS DISTINCT FROM g.result OR m.pending_result IS DISTINCT FROM g.pending_result
          OR m.elo IS DISTINCT FROM g.elo OR m.submitted_by_user_id IS DISTINCT FROM g.submitted_by);

      -- Older repository patches encoded absence as JSON null. Convert it to
      -- SQL NULL before deciding whether a result-bearing game needs backfill.
      UPDATE tournaments.tournament_matches SET result=NULLIF(result,'null'::jsonb),
        pending_result=NULLIF(pending_result,'null'::jsonb),elo=NULLIF(elo,'null'::jsonb)
        WHERE result='null'::jsonb OR pending_result='null'::jsonb OR elo='null'::jsonb;
      UPDATE tournaments.games SET result=NULLIF(result,'null'::jsonb),
        pending_result=NULLIF(pending_result,'null'::jsonb),elo=NULLIF(elo,'null'::jsonb)
        WHERE result='null'::jsonb OR pending_result='null'::jsonb OR elo='null'::jsonb;

      -- Relink orphaned canonical games first. The source index makes this unambiguous.
      UPDATE tournaments.tournament_matches m SET game_id=g.id FROM tournaments.games g
        WHERE m.game_id IS NULL AND g.source_type='tournament_match' AND g.source_id=m.id;
      INSERT INTO tournaments.games(player_ids,status,source_type,source_id,venue_mode,created_at,
        pending_result,result,elo,submitted_by,submitted_at)
      SELECT ARRAY_REMOVE(ARRAY[
        (SELECT u.id FROM accounts.users u WHERE u.id=CASE WHEN m.participant_snapshots ? a.id::text
          THEN (m.participant_snapshots->a.id::text->>'userId')::int ELSE a.user_id END),
        (SELECT u.id FROM accounts.users u WHERE u.id=CASE WHEN m.participant_snapshots ? b.id::text
          THEN (m.participant_snapshots->b.id::text->>'userId')::int ELSE b.user_id END)],NULL),
        CASE WHEN m.is_bye THEN 'cancelled' WHEN m.status='completed' THEN 'completed'
          WHEN m.status='pending_confirmation' THEN 'pending_confirmation' ELSE 'open' END,
        'tournament_match',m.id,t.venue_mode,m.created_at,m.pending_result,m.result,m.elo,m.submitted_by_user_id,
        CASE WHEN m.result IS NOT NULL OR m.pending_result IS NOT NULL THEN COALESCE(m.completed_at,m.updated_at,m.created_at) END
      FROM tournaments.tournament_matches m JOIN tournaments.tournaments t ON t.id=m.tournament_id
      LEFT JOIN tournaments.tournament_participants a ON a.id=m.participant_a_id
      LEFT JOIN tournaments.tournament_participants b ON b.id=m.participant_b_id
      WHERE m.game_id IS NULL AND (m.result IS NOT NULL OR m.pending_result IS NOT NULL OR m.elo IS NOT NULL
        OR m.submitted_by_user_id IS NOT NULL OR (NOT m.is_bye AND m.status IN ('active','pending_confirmation','completed')
          AND m.participant_a_id IS NOT NULL AND m.participant_b_id IS NOT NULL));
      UPDATE tournaments.tournament_matches m SET game_id=g.id FROM tournaments.games g
        WHERE m.game_id IS NULL AND g.source_type='tournament_match' AND g.source_id=m.id;
      -- Fill only missing canonical fields; archive above retains every different legacy value.
      UPDATE tournaments.games g SET result=COALESCE(g.result,m.result),
        pending_result=CASE WHEN g.pending_result IS NOT NULL THEN g.pending_result
          WHEN COALESCE(g.result,m.result) IS NULL THEN m.pending_result ELSE NULL END,
        elo=COALESCE(g.elo,m.elo),submitted_by=COALESCE(g.submitted_by,m.submitted_by_user_id),
        submitted_at=COALESCE(g.submitted_at,m.completed_at,CASE WHEN m.result IS NOT NULL OR m.pending_result IS NOT NULL THEN m.updated_at END),
        status=CASE WHEN m.is_bye THEN 'cancelled' WHEN g.result IS NULL AND m.result IS NOT NULL THEN 'completed'
          WHEN g.pending_result IS NULL AND m.pending_result IS NOT NULL AND g.result IS NULL THEN 'pending_confirmation' ELSE g.status END
      FROM tournaments.tournament_matches m WHERE m.game_id=g.id;

      INSERT INTO tournaments.game_participants(game_id,slot,user_id,tournament_participant_id,result_key,
        display_name_snapshot,faction_snapshot,is_proxy)
      SELECT m.game_id,s.slot,
        CASE WHEN m.participant_snapshots ? p.id::text THEN
          (SELECT u.id FROM accounts.users u WHERE u.id=(m.participant_snapshots->p.id::text->>'userId')::int)
          ELSE p.user_id END,p.id,
        CASE WHEN m.participant_snapshots ? p.id::text THEN COALESCE((m.participant_snapshots->p.id::text->>'resultKey')::int,(m.participant_snapshots->p.id::text->>'userId')::int,-p.id)
          ELSE COALESCE(p.user_id,-p.id) END,
        COALESCE(m.participant_snapshots->p.id::text->>'displayName',p.display_name),
        COALESCE(m.participant_snapshots->p.id::text->>'faction',p.faction,''),
        COALESCE((m.participant_snapshots->p.id::text->>'isProxy')::boolean,p.is_proxy)
      FROM tournaments.tournament_matches m
      CROSS JOIN LATERAL (VALUES (1::smallint,m.participant_a_id),(2::smallint,m.participant_b_id)) s(slot,participant_id)
      JOIN tournaments.tournament_participants p ON p.id=s.participant_id
      WHERE m.game_id IS NOT NULL ON CONFLICT(game_id,slot) DO UPDATE
        SET tournament_participant_id=EXCLUDED.tournament_participant_id
        WHERE game_participants.tournament_participant_id IS NULL AND game_participants.result_key=EXCLUDED.result_key;
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM tournaments.tournament_matches m JOIN tournaments.game_participants gp ON gp.game_id=m.game_id
          WHERE NOT m.is_bye AND gp.tournament_participant_id IS DISTINCT FROM
            CASE WHEN gp.slot=1 THEN m.participant_a_id ELSE m.participant_b_id END) THEN
          RAISE EXCEPTION 'Legacy game participant conflicts with match side; repair explicitly before migration 080';
        END IF;
      END $$;

      ALTER TABLE tournaments.tournament_matches DROP COLUMN pending_result,DROP COLUMN result,
        DROP COLUMN elo,DROP COLUMN submitted_by_user_id;

      -- Snapshot scores are a projection of the one stored game result. Never
      -- reinterpret old user keys as positive tournament-participant IDs.
      CREATE VIEW tournaments.tournament_match_results WITH (security_invoker=true) AS
      SELECT m.*,g.pending_result,
        CASE WHEN g.result IS NULL THEN NULL ELSE g.result || jsonb_build_object('scoresByParticipantId',
          COALESCE(g.result->'scoresByParticipantId',
            (SELECT jsonb_object_agg(p.id::text,COALESCE(g.result->'scores'->COALESCE(gp.result_key,p.user_id,-p.id)::text,'{}'::jsonb))
             FROM tournaments.tournament_participants p LEFT JOIN tournaments.game_participants gp
               ON gp.game_id=m.game_id AND gp.tournament_participant_id=p.id
             WHERE p.id IN (m.participant_a_id,m.participant_b_id)), '{}'::jsonb)) END AS result,
        g.elo,g.submitted_by AS submitted_by_user_id
      FROM tournaments.tournament_matches m LEFT JOIN tournaments.games g ON g.id=m.game_id;

      CREATE FUNCTION tournaments.validate_tournament_match_identity(m tournaments.tournament_matches) RETURNS void LANGUAGE plpgsql
        SET search_path=pg_catalog,tournaments,accounts,pg_temp AS $$
      DECLARE r JSONB; g games%ROWTYPE; key_a INTEGER; key_b INTEGER; expected_winner INTEGER;
      BEGIN
        IF m.game_id IS NOT NULL THEN
          SELECT * INTO g FROM games WHERE id=m.game_id FOR SHARE;
          IF NOT FOUND OR g.source_type<>'tournament_match' OR g.source_id IS DISTINCT FROM m.id THEN
            RAISE EXCEPTION 'Game does not belong to this tournament match' USING ERRCODE='23514';
          END IF;
          IF NOT m.is_bye AND m.status IN ('active','pending_confirmation','completed')
            AND g.status<>(CASE WHEN m.status='active' THEN 'open' ELSE m.status END) THEN
            RAISE EXCEPTION 'Canonical game status conflicts with tournament match' USING ERRCODE='23514';
          END IF;
        END IF;
        IF m.is_bye OR m.status<>'completed' THEN RETURN; END IF;
        r:=g.result;
        IF r IS NULL OR r='null'::jsonb OR g.status<>'completed' THEN RAISE EXCEPTION 'Completed match requires a canonical game result' USING ERRCODE='23514'; END IF;
        SELECT COALESCE(gp.result_key,p.user_id,-p.id) INTO key_a FROM tournament_participants p
          LEFT JOIN game_participants gp ON gp.game_id=m.game_id AND gp.tournament_participant_id=p.id WHERE p.id=m.participant_a_id;
        SELECT COALESCE(gp.result_key,p.user_id,-p.id) INTO key_b FROM tournament_participants p
          LEFT JOIN game_participants gp ON gp.game_id=m.game_id AND gp.tournament_participant_id=p.id WHERE p.id=m.participant_b_id;
        IF key_a IS NULL OR key_b IS NULL OR key_a=key_b THEN
          RAISE EXCEPTION 'Result requires two distinct participant identities' USING ERRCODE='23514'; END IF;
        expected_winner:=CASE WHEN r->>'winnerId'=key_a::text THEN m.participant_a_id
          WHEN r->>'winnerId'=key_b::text THEN m.participant_b_id ELSE NULL END;
        IF (r->>'winnerId' IS NOT NULL AND expected_winner IS NULL) OR m.winner_participant_id IS DISTINCT FROM expected_winner THEN
          RAISE EXCEPTION 'Game winner must match winner_participant_id' USING ERRCODE='23514'; END IF;
        RETURN;
      END $$;
      DO $$ DECLARE m tournaments.tournament_matches%ROWTYPE; BEGIN
        FOR m IN SELECT * FROM tournaments.tournament_matches LOOP
          PERFORM tournaments.validate_tournament_match_identity(m);
        END LOOP;
      END $$;
      CREATE OR REPLACE FUNCTION tournaments.guard_tournament_match_identity() RETURNS trigger LANGUAGE plpgsql
        SECURITY DEFINER SET search_path=pg_catalog,tournaments,accounts,pg_temp AS $$
      BEGIN PERFORM validate_tournament_match_identity(NEW); RETURN NEW; END $$;
      CREATE TRIGGER tournament_match_identity_guard BEFORE INSERT OR UPDATE OF tournament_id,round_id,
        participant_a_id,participant_b_id,winner_participant_id,game_id,status,is_bye ON tournaments.tournament_matches
        FOR EACH ROW EXECUTE FUNCTION tournaments.guard_tournament_match_identity();

      -- A direct game write must not invalidate a linked match. Deferred checking
      -- permits the normal game-then-match update within one transaction.
      CREATE FUNCTION tournaments.check_game_match_result() RETURNS trigger LANGUAGE plpgsql
        SET search_path=pg_catalog,tournaments,pg_temp AS $$
      DECLARE m tournament_matches%ROWTYPE;
      BEGIN
        FOR m IN SELECT * FROM tournament_matches WHERE game_id=NEW.id LOOP
          PERFORM validate_tournament_match_identity(m);
        END LOOP;
        IF EXISTS(SELECT 1 FROM tournament_team_match_games l JOIN games g ON g.id=l.game_id WHERE g.id=NEW.id
          AND (g.source_type<>'team_match_game' OR g.source_id IS DISTINCT FROM l.team_match_id OR g.source_slot<>l.slot)) THEN
          RAISE EXCEPTION 'Game source conflicts with team link' USING ERRCODE='23514'; END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER canonical_game_match_guard AFTER UPDATE OF result,status,source_type,source_id,source_slot
        ON tournaments.games DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
        EXECUTE FUNCTION tournaments.check_game_match_result();
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_tournaments') THEN
          GRANT SELECT ON tournaments.tournament_match_results TO kt_tournaments;
        END IF;
      END $$;
    `);
  }
};
