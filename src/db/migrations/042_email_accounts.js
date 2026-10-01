module.exports = {
  version: 42, name: "email_accounts",
  async up(client) {
    await client.query([
      "CREATE TABLE user_email_accounts (",
      "user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,",
      "email TEXT UNIQUE, verified_at TIMESTAMPTZ, pending_email TEXT,",
      "locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'en')),",
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
      "CHECK ((email IS NULL) = (verified_at IS NULL)));",
      "CREATE TABLE email_tokens (",
      "token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
      "purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),",
      "email TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ,",
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());",
      "CREATE INDEX email_tokens_user ON email_tokens(user_id, purpose);",
      "CREATE TABLE email_outbox (",
      "id UUID PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,",
      "kind TEXT NOT NULL, recipient_hash TEXT NOT NULL, payload TEXT,",
      "token_hash TEXT REFERENCES email_tokens(token_hash) ON DELETE SET NULL,",
      "state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','sent','local','failed','cancelled')),",
      "attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),",
      "locked_until TIMESTAMPTZ, first_attempt_at TIMESTAMPTZ,",
      "expires_at TIMESTAMPTZ NOT NULL, provider_id TEXT UNIQUE, last_error TEXT,",
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), sent_at TIMESTAMPTZ);",
      "CREATE INDEX email_outbox_pending ON email_outbox(next_attempt_at) WHERE state IN ('pending','processing');",
      "CREATE TABLE email_suppressions (",
      "recipient_hash TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());",
      "CREATE TABLE email_webhook_events (",
      "event_id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, event_type TEXT NOT NULL,",
      "occurred_at TIMESTAMPTZ NOT NULL, received_at TIMESTAMPTZ NOT NULL DEFAULT NOW());",
      "CREATE INDEX email_webhook_provider ON email_webhook_events(provider_id);",
      "CREATE TABLE email_rate_limits (",
      "key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL);"
    ].join("\n"));
  }
};
