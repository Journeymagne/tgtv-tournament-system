module.exports = {
  version: 28,
  name: "tournament_registration",
  async up(client) {
    await client.query(`
      ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_limit INTEGER
        CHECK (registration_limit > 0);
      ALTER TABLE tournament_participants ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE tournament_team_rosters ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;
    `);
  }
};
