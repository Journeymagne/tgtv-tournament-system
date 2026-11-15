module.exports = {
  version: 30,
  name: "tournament_live",
  async up(client) {
    await client.query(`
      ALTER TABLE tournament_team_rosters ALTER COLUMN team_id DROP NOT NULL;
      ALTER TABLE tournament_team_rosters ADD COLUMN IF NOT EXISTS is_reserve BOOLEAN NOT NULL DEFAULT FALSE;
      CREATE SEQUENCE IF NOT EXISTS tournament_feed_revision;
      CREATE OR REPLACE FUNCTION advance_tournament_feed() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM nextval('tournament_feed_revision');
        RETURN NULL;
      END $$;
    `);
    for (const table of ["tournaments", "tournament_rounds", "tournament_matches", "tournament_participants", "tournament_tables",
      "tournament_team_rosters", "tournament_team_roster_members", "tournament_team_matches", "tournament_team_match_games",
      "player_teams", "player_team_memberships", "games", "game_participants", "users"]) {
      await client.query(`DROP TRIGGER IF EXISTS tournament_feed_changed ON ${table};
        CREATE TRIGGER tournament_feed_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION advance_tournament_feed()`);
    }
  }
};
