module.exports = {
  version: 72, name: 'training_team_courses',
  async up(client) {
    await client.query(`
      ALTER TABLE knowthykt.training_sessions
        ADD COLUMN team TEXT NOT NULL DEFAULT 'core' CHECK(team IN ('core','hand-of-the-archon')),
        DROP CONSTRAINT training_sessions_items_check;
      ALTER TABLE knowthykt.training_sessions ADD CONSTRAINT training_sessions_items_check
        CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 1 AND 20);
      ALTER TABLE knowthykt.training_profiles ADD COLUMN team_awards JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK(jsonb_typeof(team_awards)='object');
      CREATE VIEW knowthykt.public_team_awards AS SELECT user_id,team_awards FROM knowthykt.training_profiles;
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_tournaments') THEN
          GRANT SELECT ON knowthykt.public_team_awards TO kt_tournaments;
        END IF;
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='kt_knowthykt') THEN
          GRANT SELECT ON knowthykt.public_team_awards TO kt_knowthykt;
        END IF;
      END $$;
    `);
  }
};
