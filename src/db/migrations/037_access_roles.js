module.exports = {
  version: 37,
  name: "access_roles",
  async up(client) {
    await client.query(`
      ALTER TABLE users ADD COLUMN can_create_tournaments BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN suspended_until TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN suspension_reason TEXT NOT NULL DEFAULT '';
      CREATE TABLE platform_ownership (
        singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
        owner_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE tournament_judges (
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        PRIMARY KEY (tournament_id, user_id)
      );
      CREATE INDEX tournament_judges_user ON tournament_judges(user_id);
      CREATE TABLE administrative_audit_events (
        id BIGSERIAL PRIMARY KEY,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        before JSONB,
        after JSONB,
        reason TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX administrative_audit_created ON administrative_audit_events(created_at DESC);
    `);
  }
};
