module.exports = {
  version: 36,
  name: "studio_tts_exports",
  async up(client) {
    await client.query(`
      CREATE TABLE studio_tts_exports (
        id UUID PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        manifest JSONB NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX studio_tts_exports_owner ON studio_tts_exports(owner_id, project_id, created_at DESC);
      CREATE TABLE studio_tts_assets (
        export_id UUID NOT NULL REFERENCES studio_tts_exports(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        bytes BYTEA NOT NULL,
        hash TEXT NOT NULL,
        PRIMARY KEY (export_id, name)
      );
    `);
  }
};
