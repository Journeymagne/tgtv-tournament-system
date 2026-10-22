module.exports={version:60,name:'account_session_contracts',async up(client){
  await client.query(`
    CREATE FUNCTION accounts.session_identity(session_token TEXT) RETURNS JSONB
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,accounts,pg_temp AS $$
      SELECT (to_jsonb(u)-'password_hash'-'avatar_data')||jsonb_build_object('expires_at',s.expires_at)
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=session_token AND s.expires_at>NOW()
    $$;
    CREATE FUNCTION accounts.renew_session(session_token TEXT, requested_expiry TIMESTAMPTZ) RETURNS void
      LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,accounts,pg_temp AS $$
      UPDATE sessions SET expires_at=LEAST(requested_expiry,NOW()+INTERVAL '14 days')
      WHERE token=session_token AND expires_at>NOW()
    $$;
    REVOKE ALL ON FUNCTION accounts.session_identity(TEXT),accounts.renew_session(TEXT,TIMESTAMPTZ) FROM PUBLIC;
  `);
}};
