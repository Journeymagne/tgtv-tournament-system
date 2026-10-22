const { TABLES, SCHEMAS, SEARCH_PATH } = require('../schemas');

module.exports = {
  version: 58, name: 'service_schemas',
  async up(client) {
    for (const schema of SCHEMAS) await client.query(`CREATE SCHEMA ${schema}`);
    for (const [schema, tables] of Object.entries(TABLES)) {
      for (const table of tables) await client.query(`ALTER TABLE public.${table} SET SCHEMA ${schema}`);
    }
    // Owned sequences, indexes and FK references follow ALTER TABLE automatically.
    for (const sequence of ['tournament_feed_revision','tournament_proxy_number']) {
      await client.query(`ALTER SEQUENCE public.${sequence} SET SCHEMA tournaments`);
    }
    // Trigger bodies contain legacy unqualified names. Pin resolution and privileges
    // so an account write does not need direct access to tournament internals.
    for (const name of ['advance_tournament_feed','guard_tournament_match_identity','telegram_signal']) {
      await client.query(`ALTER FUNCTION public.${name}() SET SCHEMA tournaments;
        ALTER FUNCTION tournaments.${name}() SET search_path = pg_catalog,tournaments,accounts,pg_temp;
        ALTER FUNCTION tournaments.${name}() SECURITY DEFINER;
        REVOKE ALL ON FUNCTION tournaments.${name}() FROM PUBLIC`);
    }
    await client.query(`SET search_path = ${SEARCH_PATH}`);
    await client.query(`
      CREATE FUNCTION tournaments.remove_account_games() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
        SET search_path=pg_catalog,tournaments,pg_temp AS $$
      BEGIN DELETE FROM games WHERE OLD.id=ANY(player_ids) AND source_type='challenge'; RETURN OLD; END $$;
      REVOKE ALL ON FUNCTION tournaments.remove_account_games() FROM PUBLIC;
      CREATE TRIGGER remove_account_games BEFORE DELETE ON accounts.users
        FOR EACH ROW EXECUTE FUNCTION tournaments.remove_account_games();
    `);
  }
};
