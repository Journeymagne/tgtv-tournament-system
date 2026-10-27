module.exports = { version: 67, name: 'resource_quotas', async up(client) {
  await client.query(`
    CREATE TABLE accounts.resource_quotas (
      user_id INTEGER PRIMARY KEY REFERENCES accounts.users(id) ON DELETE CASCADE,
      limits JSONB NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(limits)='object'),
      revision INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      changed_by INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL, reason TEXT NOT NULL);
    CREATE TABLE accounts.resource_budgets (
      key TEXT PRIMARY KEY CHECK(length(key)<=256), hits BIGINT NOT NULL DEFAULT 0,
      user_id INTEGER REFERENCES accounts.users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX resource_budgets_expiry ON accounts.resource_budgets(expires_at);
    CREATE FUNCTION accounts.spend_resource_budget(budget_key TEXT, budget BIGINT, seconds INTEGER, amount BIGINT)
      RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,accounts,pg_temp AS $$
    DECLARE usage resource_budgets; stamp TIMESTAMPTZ := clock_timestamp();
    BEGIN
      IF budget < 1 OR seconds < 1 OR seconds > 86400 OR amount < 1 THEN RAISE EXCEPTION 'Invalid resource budget'; END IF;
      INSERT INTO resource_budgets(key,user_id,hits,expires_at) VALUES(budget_key,
        CASE WHEN budget_key ~ '^user:[0-9]+:' THEN split_part(budget_key,':',2)::integer END,
        0,stamp+seconds*INTERVAL '1 second') ON CONFLICT DO NOTHING;
      SELECT * INTO usage FROM resource_budgets WHERE key=budget_key FOR UPDATE;
      IF usage.expires_at<=stamp THEN usage.hits:=0; usage.expires_at:=stamp+seconds*INTERVAL '1 second'; END IF;
      IF usage.hits+amount>budget THEN RETURN GREATEST(1,ceil(EXTRACT(EPOCH FROM usage.expires_at-stamp))::integer); END IF;
      UPDATE resource_budgets SET hits=usage.hits+amount,expires_at=usage.expires_at WHERE key=budget_key;
      RETURN 0;
    END $$;
    REVOKE ALL ON FUNCTION accounts.spend_resource_budget(TEXT,BIGINT,INTEGER,BIGINT) FROM PUBLIC;
    ALTER TABLE studio.studio_projects ADD COLUMN storage_bytes BIGINT NOT NULL DEFAULT 0;
    UPDATE studio.studio_projects SET storage_bytes=octet_length(project::text)+COALESCE(octet_length(published::text),0);
    CREATE FUNCTION studio.measure_project_storage() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.storage_bytes:=octet_length(NEW.project::text)+COALESCE(octet_length(NEW.published::text),0); RETURN NEW; END $$;
    CREATE TRIGGER measure_project_storage BEFORE INSERT OR UPDATE OF project,published ON studio.studio_projects
      FOR EACH ROW EXECUTE FUNCTION studio.measure_project_storage();
    CREATE INDEX IF NOT EXISTS player_teams_leader_active ON tournaments.player_teams(leader_user_id) WHERE archived_at IS NULL;
    CREATE INDEX IF NOT EXISTS tournaments_owner_status ON tournaments.tournaments(owner_user_id,status);
    CREATE INDEX IF NOT EXISTS challenges_sender_pending ON tournaments.challenges(from_user_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS feedback_user_open ON accounts.feedback(user_id) WHERE status='open';
    CREATE INDEX IF NOT EXISTS sessions_user_created ON accounts.sessions(user_id,created_at DESC);
    CREATE FUNCTION accounts.resource_usage(target INTEGER) RETURNS JSONB LANGUAGE sql SECURITY DEFINER
      SET search_path=pg_catalog,pg_temp AS $$ SELECT jsonb_build_object(
        'sessions',(SELECT count(*) FROM accounts.sessions WHERE user_id=target AND expires_at>NOW()),
        'studioProjects',(SELECT count(*) FROM studio.studio_projects WHERE owner_id=target AND deleted_at IS NULL),
        'studioStorageBytes',COALESCE((SELECT sum(storage_bytes) FROM studio.studio_projects WHERE owner_id=target),0)+COALESCE((SELECT sum(byte_size+octet_length(manifest::text)) FROM studio.studio_tts_exports WHERE owner_id=target),0),
        'ttsStorageBytes',COALESCE((SELECT sum(byte_size) FROM studio.studio_tts_exports WHERE owner_id=target),0),
        'teamsActive',(SELECT count(*) FROM tournaments.player_teams WHERE leader_user_id=target AND archived_at IS NULL),
        'tournamentsActive',(SELECT count(*) FROM tournaments.tournaments WHERE owner_user_id=target AND status NOT IN ('completed','cancelled')),
        'challengeActive',(SELECT count(*) FROM tournaments.challenges WHERE from_user_id=target AND status='pending'),
        'feedbackOpen',(SELECT count(*) FROM accounts.feedback WHERE user_id=target AND status='open')) $$;
    REVOKE ALL ON FUNCTION accounts.resource_usage(INTEGER) FROM PUBLIC;
    DO $$ DECLARE svc TEXT; BEGIN
      FOREACH svc IN ARRAY ARRAY['accounts','tournaments','studio','faq','knowthykt','notifications'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_'||svc) THEN
          EXECUTE format('GRANT SELECT ON accounts.resource_quotas TO %I','kt_'||svc);
          EXECUTE format('GRANT EXECUTE ON FUNCTION accounts.spend_resource_budget(TEXT,BIGINT,INTEGER,BIGINT) TO %I','kt_'||svc);
        END IF;
      END LOOP;
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_accounts') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON accounts.resource_quotas,accounts.resource_budgets TO kt_accounts;
        GRANT EXECUTE ON FUNCTION accounts.resource_usage(INTEGER) TO kt_accounts;
      END IF;
    END $$;
  `);
} };
