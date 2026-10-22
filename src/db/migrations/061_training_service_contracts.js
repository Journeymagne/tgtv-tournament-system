module.exports = {
  version: 61,
  name: 'training_service_contracts',
  async up(client) {
    // Released 1.4.x databases already ran 058-060 without training. Migration
    // 056 creates their missing tables in public; fresh installs moved them in
    // 058. Preserve both layouts, including progress from local previews.
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS knowthykt;
      ALTER TABLE IF EXISTS public.training_profiles SET SCHEMA knowthykt;
      ALTER TABLE IF EXISTS public.training_sessions SET SCHEMA knowthykt;
      CREATE OR REPLACE VIEW knowthykt.public_progress AS
        SELECT user_id,stats FROM knowthykt.training_profiles;

      CREATE TABLE IF NOT EXISTS knowthykt.notification_messages (
        user_id INTEGER NOT NULL REFERENCES accounts.users(id) ON DELETE CASCADE,
        notification_id TEXT NOT NULL, payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
        PRIMARY KEY(user_id,notification_id));
      CREATE TABLE IF NOT EXISTS knowthykt.notification_outbox (
        id BIGSERIAL PRIMARY KEY, user_id INTEGER NOT NULL, notification_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK(operation IN ('upsert','delete')), payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE OR REPLACE FUNCTION knowthykt.queue_notification() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = pg_catalog, knowthykt, pg_temp AS $$
      BEGIN
        IF TG_OP='DELETE' THEN
          INSERT INTO notification_outbox(user_id,notification_id,operation)
            VALUES(OLD.user_id,OLD.notification_id,'delete');
          RETURN OLD;
        END IF;
        IF TG_OP='INSERT' OR NEW.payload IS DISTINCT FROM OLD.payload THEN
          INSERT INTO notification_outbox(user_id,notification_id,operation,payload)
            VALUES(NEW.user_id,NEW.notification_id,'upsert',NEW.payload);
        END IF;
        RETURN NEW;
      END $$;
      REVOKE ALL ON FUNCTION knowthykt.queue_notification() FROM PUBLIC;
      DROP TRIGGER IF EXISTS queue_notification ON knowthykt.notification_messages;
      CREATE TRIGGER queue_notification
        AFTER INSERT OR UPDATE OR DELETE ON knowthykt.notification_messages
        FOR EACH ROW EXECUTE FUNCTION knowthykt.queue_notification();
    `);
  }
};
