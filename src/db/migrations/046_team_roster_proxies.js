module.exports = {
  version: 46,
  name: "team_roster_proxies",
  async up(client) {
    await client.query(`
      ALTER TABLE tournament_team_roster_members
        ADD COLUMN is_proxy BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE tournament_team_roster_members
        ADD CONSTRAINT team_roster_proxy_no_account CHECK (NOT is_proxy OR user_id IS NULL);
    `);
  }
};
