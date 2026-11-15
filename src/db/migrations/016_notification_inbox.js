const SCHEMA = `
  CREATE TABLE IF NOT EXISTS notification_inbox_state (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_challenges_incoming_pending
    ON challenges(to_user_id, created_at DESC)
    WHERE status = 'pending';
`;

module.exports = {
  version: 16,
  name: "notification_inbox",
  async up(client) {
    await client.query(SCHEMA);
  }
};
