module.exports = {
  version: 102,
  name: 'q4_season',
  async up(client) {
    await client.query(`UPDATE tierlists.tierlist_seasons SET ends_at='2026-11-09T00:00:00+04:00'
      WHERE id='2026-q3-dataslate'`);
    await client.query(`INSERT INTO tierlists.tierlist_seasons(id,label,starts_at,ends_at,position)
      VALUES ('2026-q4-dataslate','2026 Q4','2026-11-09T00:00:00+04:00',NULL,3)
      ON CONFLICT (id) DO NOTHING`);
  }
};
