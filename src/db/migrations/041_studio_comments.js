module.exports={version:41,name:"studio_comments",async up(client){
  await client.query(`CREATE TABLE studio_comments (
    id UUID PRIMARY KEY,
    publication_id UUID NOT NULL REFERENCES studio_projects(publication_id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    root_id UUID REFERENCES studio_comments(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES studio_comments(id) ON DELETE SET NULL,
    body TEXT NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 2000),
    publication_revision INTEGER NOT NULL,version_label TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,request_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,hidden_at TIMESTAMPTZ,moderation_reason TEXT NOT NULL DEFAULT '',
    UNIQUE(author_id,request_id),CHECK(root_id IS NULL OR root_id<>id)
  );
  CREATE INDEX studio_comments_roots ON studio_comments(publication_id,created_at DESC,id DESC) WHERE root_id IS NULL;
  CREATE INDEX studio_comments_replies ON studio_comments(root_id,created_at,id);
  CREATE TABLE studio_comment_audit (
    id BIGSERIAL PRIMARY KEY,comment_id UUID REFERENCES studio_comments(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,action TEXT NOT NULL,
    snapshot JSONB,reason TEXT NOT NULL DEFAULT '',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX studio_comment_rate ON studio_comment_audit(actor_id,created_at DESC);
  CREATE TABLE studio_comment_reports (
    id UUID PRIMARY KEY,comment_id UUID NOT NULL REFERENCES studio_comments(id) ON DELETE CASCADE,
    reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK(reason IN ('spam','abuse','other')),
    details TEXT NOT NULL DEFAULT '' CHECK(char_length(details)<=500),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','hidden','dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),resolved_at TIMESTAMPTZ,
    resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,resolution TEXT NOT NULL DEFAULT ''
  );
  CREATE UNIQUE INDEX studio_comment_report_open ON studio_comment_reports(comment_id,reporter_id) WHERE status='open';`);
}};
