module.exports = {
  version: 85,
  name: "tournament_pairing_mode",
  async up(client) {
    await client.query(`ALTER TABLE tournaments.tournaments
      ADD COLUMN pairing_mode TEXT NOT NULL DEFAULT 'backet_random'
      CHECK (pairing_mode IN ('backet_random', 'by_tp'))`);
  }
};
