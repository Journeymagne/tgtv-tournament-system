module.exports = {
  version: 32,
  name: "studio_projects",
  async up(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS studio_projects (
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        project JSONB NOT NULL,
        revision INTEGER NOT NULL CHECK (revision > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        publication_id UUID UNIQUE,
        published JSONB,
        published_at TIMESTAMPTZ,
        PRIMARY KEY (owner_id, project_id)
      );
      CREATE INDEX IF NOT EXISTS studio_projects_published_at
        ON studio_projects(published_at DESC) WHERE published IS NOT NULL;
    `);
  }
};
