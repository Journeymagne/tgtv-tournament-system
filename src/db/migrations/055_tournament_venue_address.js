module.exports = {
  version: 55,
  name: "tournament_venue_address",
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS venue_address TEXT NOT NULL DEFAULT ''
        CHECK (char_length(venue_address) <= 500);
    `);
  }
};
