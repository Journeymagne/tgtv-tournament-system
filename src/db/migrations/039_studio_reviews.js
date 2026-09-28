module.exports = {
  version: 39,
  name: "studio_reviews",
  async up(client) {
    await client.query(`
      ALTER TABLE studio_projects ADD COLUMN published_revision INTEGER NOT NULL DEFAULT 0;
      UPDATE studio_projects SET published_revision=1 WHERE published IS NOT NULL;
      CREATE TABLE studio_reviews (
        id UUID PRIMARY KEY,
        publication_id UUID NOT NULL REFERENCES studio_projects(publication_id) ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
        theme_score SMALLINT NOT NULL CHECK (theme_score BETWEEN 1 AND 5),
        balance_score SMALLINT NOT NULL CHECK (balance_score BETWEEN 1 AND 5),
        lore_score SMALLINT NOT NULL CHECK (lore_score BETWEEN 1 AND 5),
        publication_revision INTEGER NOT NULL,
        version_label TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        request_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        hidden_at TIMESTAMPTZ,
        moderation_reason TEXT NOT NULL DEFAULT '',
        UNIQUE(author_id,request_id)
      );
      CREATE UNIQUE INDEX studio_reviews_one_author ON studio_reviews(publication_id,author_id) WHERE deleted_at IS NULL;
      CREATE INDEX studio_reviews_page ON studio_reviews(publication_id,created_at DESC,id DESC) WHERE deleted_at IS NULL AND hidden_at IS NULL;
      CREATE TABLE studio_review_audit (
        id BIGSERIAL PRIMARY KEY,
        review_id UUID REFERENCES studio_reviews(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        snapshot JSONB,
        reason TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX studio_review_rate ON studio_review_audit(actor_id,created_at DESC);
      CREATE TABLE studio_review_reports (
        id UUID PRIMARY KEY,
        review_id UUID NOT NULL REFERENCES studio_reviews(id) ON DELETE CASCADE,
        reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT NOT NULL CHECK (reason IN ('spam','abuse','other')),
        details TEXT NOT NULL DEFAULT '' CHECK (char_length(details)<=500),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','hidden','dismissed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMPTZ,
        resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        resolution TEXT NOT NULL DEFAULT ''
      );
      CREATE UNIQUE INDEX studio_review_report_open ON studio_review_reports(review_id,reporter_id) WHERE status='open';
      CREATE TABLE studio_discussion_state (
        publication_id UUID PRIMARY KEY REFERENCES studio_projects(publication_id) ON DELETE CASCADE,
        locked_at TIMESTAMPTZ,
        locked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reason TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE studio_review_preferences (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        notifications BOOLEAN NOT NULL DEFAULT TRUE
      );
    `);
  }
};
