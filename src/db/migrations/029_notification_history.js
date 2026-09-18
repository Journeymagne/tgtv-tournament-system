module.exports = {
  version: 29,
  name: "notification_history",
  async up(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_inbox_items (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        notification_id TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        read_at TIMESTAMPTZ,
        PRIMARY KEY (user_id, notification_id)
      );
      CREATE INDEX IF NOT EXISTS idx_notification_inbox_recent
        ON notification_inbox_items (user_id, created_at DESC, notification_id DESC);
    `);
  }
};
