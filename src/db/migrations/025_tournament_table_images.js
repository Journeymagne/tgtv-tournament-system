module.exports = {
  version: 25,
  name: "tournament_table_images",
  async up(client) {
    await client.query(`CREATE TABLE IF NOT EXISTS tournament_table_images (
      id SERIAL PRIMARY KEY,
      tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      image_data TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, content_hash)
    )`);
  }
};
