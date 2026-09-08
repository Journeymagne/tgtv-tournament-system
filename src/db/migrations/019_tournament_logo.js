module.exports = {
  version: 19,
  name: "tournament_logo",
  async up(client) {
    await client.query("ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS logo_data TEXT");
  }
};
