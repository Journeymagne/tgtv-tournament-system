module.exports = {
  version: 68, name: 'training_notification_once',
  async up(client) {
    // Match the bank -> profile lock order used by answers and moderation.
    await client.query('SELECT id FROM knowthykt.training_bank_state FOR UPDATE');
    await client.query('SELECT user_id FROM knowthykt.training_profiles ORDER BY user_id FOR UPDATE');
    await client.query(`
      UPDATE knowthykt.training_profiles p SET recertification_key='once'
      WHERE p.recertification_key IS NULL AND EXISTS (
        SELECT 1 FROM knowthykt.notification_messages n
        WHERE n.user_id=p.user_id AND n.payload->>'type'='knowthykt_recertification');
      WITH duplicates AS (
        SELECT user_id,notification_id,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at,notification_id) AS position
        FROM knowthykt.notification_messages
        WHERE payload->>'type'='knowthykt_recertification'
      )
      DELETE FROM knowthykt.notification_messages n USING duplicates d
      WHERE n.user_id=d.user_id AND n.notification_id=d.notification_id AND d.position>1;
    `);
    // Keep the first notice and its read state. DELETE triggers remove only
    // duplicate inbox entries through the normal notification outbox.
  }
};
