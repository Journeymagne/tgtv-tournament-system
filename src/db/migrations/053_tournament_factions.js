module.exports = {
  version: 53,
  name: "tournament_factions",
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments ADD COLUMN faction_count INTEGER NOT NULL DEFAULT 1
        CHECK (faction_count BETWEEN 1 AND 3);
      ALTER TABLE tournament_participants ADD COLUMN factions TEXT[] NOT NULL DEFAULT '{}'
        CHECK (cardinality(factions) <= 3);
      ALTER TABLE tournament_team_roster_members ADD COLUMN factions TEXT[] NOT NULL DEFAULT '{}'
        CHECK (cardinality(factions) <= 3);
      UPDATE tournament_participants SET factions = ARRAY[faction] WHERE COALESCE(faction, '') <> '';
      UPDATE tournament_team_roster_members SET factions = ARRAY[faction_snapshot] WHERE COALESCE(faction_snapshot, '') <> '';
    `);
  }
};
