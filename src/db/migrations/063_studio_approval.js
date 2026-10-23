module.exports = {
  version: 63, name: 'studio_approval',
  async up(client) {
    await client.query(`ALTER TABLE studio.studio_projects
      ADD COLUMN approved_at TIMESTAMPTZ,
      ADD COLUMN approved_by INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
      ADD COLUMN approval_revision INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE studio.studio_projects ADD CONSTRAINT studio_approval_revision_nonnegative CHECK (approval_revision >= 0);`);
  }
};
