require('../src/config');
const { getPool, closePool } = require('../src/db/pool');
const { SCHEMAS } = require('../src/db/schemas');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
async function provision() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows:columns }=await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='accounts' AND table_name='users' AND column_name<>'password_hash' ORDER BY ordinal_position");
    const publicColumns=columns.map(row=>'"'+row.column_name.replaceAll('"','""')+'"').join(',');
    for (const schema of SCHEMAS) {
      const role = 'kt_' + schema, password = process.env[schema.toUpperCase() + '_DB_PASSWORD'];
      if (!password || password.length < 24) throw Error(schema.toUpperCase() + '_DB_PASSWORD must contain at least 24 characters');
      const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role]);
      await client.query(`${exists.rowCount ? 'ALTER' : 'CREATE'} ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD ${quote(password)}`);
      await client.query(`GRANT USAGE ON SCHEMA ${schema},accounts,public TO ${role};
        GRANT SELECT ON public.schema_migrations TO ${role};
        GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role};
        GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role};
        GRANT SELECT ON accounts.platform_ownership TO ${role};
        GRANT EXECUTE ON FUNCTION accounts.session_identity(TEXT),accounts.renew_session(TEXT,TIMESTAMPTZ) TO ${role};
        GRANT INSERT ON accounts.administrative_audit_events TO ${role};
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA accounts TO ${role}`);
      if (schema!=='accounts') await client.query(`REVOKE ALL ON accounts.users,accounts.sessions FROM ${role};
        REVOKE UPDATE(expires_at) ON accounts.sessions FROM ${role};
        GRANT SELECT(${publicColumns}) ON accounts.users TO ${role}`);
    }
    for (const source of ['tournaments','studio','faq','knowthykt']) await client.query(`
      GRANT USAGE ON SCHEMA ${source} TO kt_notifications;
      GRANT SELECT,DELETE ON ${source}.notification_outbox TO kt_notifications;
      GRANT UPDATE(id) ON ${source}.notification_outbox TO kt_notifications`);
    await client.query(`
      GRANT UPDATE(rating,rating_tts,rating_irl,rating_combined,challenge_credits,updated_at) ON accounts.users TO kt_tournaments;
      GRANT SELECT ON accounts.user_email_accounts TO kt_tournaments;
      GRANT USAGE ON SCHEMA knowthykt TO kt_tournaments;
      GRANT SELECT ON knowthykt.public_progress TO kt_tournaments;
      GRANT SELECT ON knowthykt.public_questions TO kt_tournaments;
      GRANT SELECT ON knowthykt.public_ranks TO kt_tournaments;
    `);
    await client.query('COMMIT');
    console.log('Provisioned six service roles; application processes do not own schemas.');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
if (require.main === module) provision().then(closePool).catch(async error => { console.error(error.message); await closePool(); process.exitCode=1; });
module.exports = { provision };
