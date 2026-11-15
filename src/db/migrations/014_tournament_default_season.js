module.exports = {
  version: 14,
  name: "tournament_default_season_q3",
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments
        ALTER COLUMN season_id SET DEFAULT '2026-q3-dataslate'
    `);
  }
};
