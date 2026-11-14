module.exports = { version: 92, name: 'miniapp_account_link', async up(client) {
  await client.query(`
    CREATE TABLE accounts.telegram_miniapp_link_flows (
      challenge_hash TEXT PRIMARY KEY CHECK(challenge_hash ~ '^[a-f0-9]{64}$'),
      telegram_id BIGINT NOT NULL CHECK(telegram_id>0),
      init_data_hash TEXT NOT NULL CHECK(init_data_hash ~ '^[a-f0-9]{64}$'),
      username TEXT CHECK(length(username)<=32), display_name TEXT NOT NULL CHECK(length(display_name)<=120),
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()+INTERVAL '5 minutes',
      user_id INTEGER REFERENCES accounts.users(id) ON DELETE CASCADE,
      proof_hash TEXT CHECK(proof_hash ~ '^[a-f0-9]{64}$'), revoked_at TIMESTAMPTZ,
      CHECK((user_id IS NULL)=(proof_hash IS NULL))
    );
    CREATE INDEX miniapp_link_telegram ON accounts.telegram_miniapp_link_flows(telegram_id);
    CREATE INDEX miniapp_link_user ON accounts.telegram_miniapp_link_flows(user_id);
    CREATE INDEX miniapp_link_expiry ON accounts.telegram_miniapp_link_flows(expires_at);
    CREATE TABLE accounts.telegram_miniapp_link_budgets (
      kind TEXT NOT NULL, key_hash TEXT NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),
      hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(kind,key_hash)
    );
    CREATE INDEX miniapp_link_budget_expiry ON accounts.telegram_miniapp_link_budgets(expires_at);

    -- Policies are fixed here: callers cannot select tables or choose a budget.
    CREATE FUNCTION accounts.miniapp_link_budget(policy TEXT, target_hash TEXT) RETURNS BOOLEAN
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    DECLARE maximum INTEGER; seconds INTEGER; used INTEGER; stamp TIMESTAMPTZ:=clock_timestamp();
    BEGIN
      CASE policy
        WHEN 'ip' THEN maximum:=90; seconds:=900;
        WHEN 'telegram' THEN maximum:=10; seconds:=300;
        WHEN 'challenge' THEN maximum:=5; seconds:=300;
        WHEN 'identifier' THEN maximum:=10; seconds:=900;
        ELSE RAISE EXCEPTION 'Invalid linking policy';
      END CASE;
      IF target_hash IS NULL OR target_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid linking budget'; END IF;
      DELETE FROM accounts.telegram_miniapp_link_budgets WHERE (kind,key_hash) IN
        (SELECT kind,key_hash FROM accounts.telegram_miniapp_link_budgets WHERE expires_at<=stamp
          ORDER BY kind,key_hash LIMIT 1000 FOR UPDATE SKIP LOCKED);
      INSERT INTO accounts.telegram_miniapp_link_budgets AS b(kind,key_hash,hits,expires_at)
        VALUES(policy,target_hash,1,stamp+seconds*INTERVAL '1 second')
        ON CONFLICT(kind,key_hash) DO UPDATE SET hits=CASE WHEN b.expires_at<=stamp THEN 1 ELSE LEAST(b.hits+1,1000) END,
          expires_at=CASE WHEN b.expires_at<=stamp THEN EXCLUDED.expires_at ELSE b.expires_at END
        RETURNING hits INTO used;
      RETURN used<=maximum;
    END $$;

    CREATE FUNCTION accounts.miniapp_link_create(flow_hash TEXT, person_id BIGINT, launch_hash TEXT, person_username TEXT, person_name TEXT)
      RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    DECLARE expiry TIMESTAMPTZ;
    BEGIN
      IF person_id IS NULL OR person_id<=0 OR flow_hash IS NULL OR flow_hash !~ '^[a-f0-9]{64}$'
        OR launch_hash IS NULL OR launch_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid linking flow'; END IF;
      PERFORM pg_catalog.pg_advisory_xact_lock(91827,(person_id % 2147483647)::integer);
      DELETE FROM accounts.telegram_miniapp_link_flows WHERE challenge_hash IN
        (SELECT challenge_hash FROM accounts.telegram_miniapp_link_flows WHERE expires_at<=clock_timestamp()
          ORDER BY challenge_hash LIMIT 1000 FOR UPDATE SKIP LOCKED);
      IF (SELECT count(*) FROM accounts.telegram_miniapp_link_flows
        WHERE telegram_id=person_id AND revoked_at IS NULL AND expires_at>clock_timestamp())>=3 THEN RETURN NULL; END IF;
      INSERT INTO accounts.telegram_miniapp_link_flows(challenge_hash,telegram_id,init_data_hash,username,display_name)
        VALUES(flow_hash,person_id,launch_hash,person_username,person_name) RETURNING expires_at INTO expiry;
      RETURN expiry;
    END $$;

    CREATE FUNCTION accounts.miniapp_link_inspect(flow_hash TEXT) RETURNS JSONB
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
      SELECT jsonb_build_object('user_id',f.user_id,'telegram_id',f.telegram_id,'init_data_hash',f.init_data_hash)
        FROM accounts.telegram_miniapp_link_flows f WHERE f.challenge_hash=flow_hash
    $$;
    CREATE FUNCTION accounts.miniapp_link_consume(flow_hash TEXT, secret_hash TEXT, person_id BIGINT, launch_hash TEXT, account_id INTEGER)
      RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    DECLARE flow accounts.telegram_miniapp_link_flows;
    BEGIN
      SELECT * INTO flow FROM accounts.telegram_miniapp_link_flows WHERE challenge_hash=flow_hash FOR UPDATE;
      IF NOT FOUND OR flow.revoked_at IS NOT NULL OR flow.expires_at<=clock_timestamp()
        OR flow.user_id IS DISTINCT FROM account_id OR account_id IS NULL
        OR flow.telegram_id IS DISTINCT FROM person_id OR flow.init_data_hash IS DISTINCT FROM launch_hash
        OR flow.proof_hash IS DISTINCT FROM secret_hash OR secret_hash IS NULL THEN RETURN FALSE; END IF;
      UPDATE accounts.telegram_miniapp_link_flows SET revoked_at=clock_timestamp() WHERE challenge_hash=flow_hash;
      RETURN TRUE;
    END $$;
    CREATE FUNCTION accounts.miniapp_link_cancel(flow_hash TEXT, person_id BIGINT, launch_hash TEXT)
      RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    DECLARE flow accounts.telegram_miniapp_link_flows;
    BEGIN
      SELECT * INTO flow FROM accounts.telegram_miniapp_link_flows WHERE challenge_hash=flow_hash FOR UPDATE;
      IF NOT FOUND THEN RETURN TRUE; END IF;
      IF flow.telegram_id IS DISTINCT FROM person_id OR flow.init_data_hash IS DISTINCT FROM launch_hash THEN RETURN FALSE; END IF;
      UPDATE accounts.telegram_miniapp_link_flows SET revoked_at=clock_timestamp() WHERE challenge_hash=flow_hash;
      RETURN TRUE;
    END $$;
    CREATE FUNCTION accounts.miniapp_link_account_linked(account_id INTEGER) RETURNS BOOLEAN
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
      SELECT EXISTS(SELECT 1 FROM tournaments.telegram_links WHERE user_id=account_id)
    $$;
    CREATE FUNCTION accounts.miniapp_link_revoke_user(account_id INTEGER) RETURNS VOID
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
      UPDATE accounts.telegram_miniapp_link_flows SET revoked_at=clock_timestamp() WHERE user_id=account_id AND revoked_at IS NULL
    $$;

    -- Row-changing paths already own the account lock. Never acquire a Telegram
    -- lock here: doing so would invert the outer Telegram -> account ordering.
    CREATE FUNCTION accounts.miniapp_link_password_changed() RETURNS TRIGGER
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    BEGIN
      IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
        UPDATE accounts.telegram_miniapp_link_flows SET revoked_at=clock_timestamp() WHERE user_id=NEW.id AND revoked_at IS NULL;
        DELETE FROM tournaments.telegram_link_tokens WHERE user_id=NEW.id;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER miniapp_link_password_changed AFTER UPDATE OF password_hash ON accounts.users
      FOR EACH ROW EXECUTE FUNCTION accounts.miniapp_link_password_changed();
    CREATE FUNCTION accounts.miniapp_link_identity_changed() RETURNS TRIGGER
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
    DECLARE account_id INTEGER; person_id BIGINT;
    BEGIN
      IF TG_OP='DELETE' THEN account_id:=OLD.user_id; person_id:=OLD.telegram_id;
      ELSE account_id:=NEW.user_id; person_id:=NEW.telegram_id; END IF;
      UPDATE accounts.telegram_miniapp_link_flows SET revoked_at=clock_timestamp()
        WHERE (user_id=account_id OR telegram_id=person_id) AND revoked_at IS NULL;
      DELETE FROM tournaments.telegram_link_tokens WHERE user_id=account_id OR telegram_id=person_id;
      RETURN NULL;
    END $$;
    CREATE TRIGGER miniapp_link_identity_changed AFTER INSERT OR DELETE ON tournaments.telegram_links
      FOR EACH ROW EXECUTE FUNCTION accounts.miniapp_link_identity_changed();

    REVOKE ALL ON FUNCTION accounts.miniapp_link_budget(TEXT,TEXT),
      accounts.miniapp_link_create(TEXT,BIGINT,TEXT,TEXT,TEXT),accounts.miniapp_link_inspect(TEXT),
      accounts.miniapp_link_consume(TEXT,TEXT,BIGINT,TEXT,INTEGER),accounts.miniapp_link_cancel(TEXT,BIGINT,TEXT),
      accounts.miniapp_link_account_linked(INTEGER),accounts.miniapp_link_revoke_user(INTEGER),accounts.miniapp_link_password_changed(),accounts.miniapp_link_identity_changed() FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='kt_accounts') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON accounts.telegram_miniapp_link_flows,accounts.telegram_miniapp_link_budgets TO kt_accounts;
        GRANT EXECUTE ON FUNCTION accounts.miniapp_link_budget(TEXT,TEXT),accounts.miniapp_link_account_linked(INTEGER) TO kt_accounts;
      END IF;
      IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='kt_tournaments') THEN
        GRANT EXECUTE ON FUNCTION accounts.miniapp_link_budget(TEXT,TEXT),accounts.miniapp_link_create(TEXT,BIGINT,TEXT,TEXT,TEXT),
          accounts.miniapp_link_inspect(TEXT),accounts.miniapp_link_consume(TEXT,TEXT,BIGINT,TEXT,INTEGER),accounts.miniapp_link_cancel(TEXT,BIGINT,TEXT),
          accounts.miniapp_link_revoke_user(INTEGER) TO kt_tournaments;
      END IF;
    END $$;
  `);
} };
