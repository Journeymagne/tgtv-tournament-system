const seed = require('../../faq-data/seed.json');
module.exports={version:48,name:'community_faq',async up(client){
 await client.query(`ALTER TABLE users ADD COLUMN is_faq_moderator BOOLEAN NOT NULL DEFAULT FALSE;
 CREATE TABLE faq_entries (id TEXT PRIMARY KEY, content JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
   status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','archived')),
   created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE faq_submissions (id UUID PRIMARY KEY, author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
   entry_id TEXT REFERENCES faq_entries(id) ON DELETE SET NULL, content JSONB NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','needs_changes')),
   resolution TEXT NOT NULL DEFAULT '', result_entry_id TEXT REFERENCES faq_entries(id) ON DELETE SET NULL,
   decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), decided_at TIMESTAMPTZ);
 CREATE INDEX faq_submissions_queue ON faq_submissions(status,created_at);
 CREATE INDEX faq_submissions_author ON faq_submissions(author_id,created_at DESC);
 CREATE TABLE faq_questions (id UUID PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES faq_entries(id) ON DELETE CASCADE,
   author_id INTEGER REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL,
   reply TEXT NOT NULL DEFAULT '', replied_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
   hidden BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), replied_at TIMESTAMPTZ);
 CREATE INDEX faq_questions_entry ON faq_questions(entry_id,created_at);
 CREATE TABLE faq_history (id BIGSERIAL PRIMARY KEY,entry_id TEXT REFERENCES faq_entries(id),
   actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, snapshot JSONB,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
 for(const {id,...content} of seed.entries)await client.query('INSERT INTO faq_entries(id,content) VALUES($1,$2)',[id,JSON.stringify(content)]);
}};
