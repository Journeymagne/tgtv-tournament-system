module.exports = {
  version: 33,
  name: "studio_project_deletion",
  async up(client) {
    // Retain only an identity tombstone after deletion so an old editor cannot
    // recreate the project with a delayed first save or publication request.
    await client.query("ALTER TABLE studio_projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ");
  }
};
