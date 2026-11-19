module.exports = {
  version: 123,
  name: 'leagues',
  async up(client) {
    await client.query(`
      CREATE TABLE tournaments.leagues (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
        owner_user_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        formats TEXT[] NOT NULL CHECK (cardinality(formats) > 0 AND formats <@ ARRAY['solo','doubles','team']),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
      );
      CREATE TABLE tournaments.league_rules (
        league_id INTEGER NOT NULL REFERENCES tournaments.leagues ON DELETE CASCADE,
        track TEXT NOT NULL CHECK (track IN ('solo','org')),
        primary_points TEXT NOT NULL CHECK (primary_points IN ('tp','place')),
        scale BIGINT[] NOT NULL,
        criteria JSONB NOT NULL CHECK (jsonb_typeof(criteria) = 'array'),
        source_snapshot JSONB,
        PRIMARY KEY (league_id,track)
      );
      CREATE TABLE tournaments.league_tournaments (
        league_id INTEGER NOT NULL REFERENCES tournaments.leagues ON DELETE CASCADE,
        tournament_id INTEGER NOT NULL REFERENCES tournaments.tournaments ON DELETE CASCADE,
        PRIMARY KEY (league_id,tournament_id)
      );
      CREATE INDEX league_tournaments_reverse_idx ON tournaments.league_tournaments(tournament_id,league_id);
      CREATE TABLE tournaments.league_people (
        id SERIAL PRIMARY KEY,
        league_id INTEGER NOT NULL REFERENCES tournaments.leagues ON DELETE CASCADE,
        user_id INTEGER REFERENCES accounts.users ON DELETE SET NULL,
        register_nickname TEXT,
        display_name TEXT NOT NULL,
        origin_key TEXT,
        merged_into_id INTEGER,
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        FOREIGN KEY (league_id,merged_into_id) REFERENCES tournaments.league_people(league_id,id),
        UNIQUE (league_id,id), UNIQUE (league_id,origin_key)
      );
      CREATE UNIQUE INDEX league_people_user_idx ON tournaments.league_people(league_id,user_id) WHERE user_id IS NOT NULL;
      CREATE TABLE tournaments.league_person_bindings (
        league_id INTEGER NOT NULL REFERENCES tournaments.leagues ON DELETE CASCADE,
        source_key TEXT NOT NULL,
        tournament_id INTEGER NOT NULL REFERENCES tournaments.tournaments ON DELETE CASCADE,
        person_id INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        manual BOOLEAN NOT NULL DEFAULT FALSE,
        confirmed_by INTEGER REFERENCES accounts.users ON DELETE SET NULL,
        confirmed_at TIMESTAMPTZ,
        PRIMARY KEY (league_id,source_key),
        FOREIGN KEY (league_id,person_id) REFERENCES tournaments.league_people(league_id,id) ON DELETE CASCADE
      );
      CREATE INDEX league_bindings_person_idx ON tournaments.league_person_bindings(league_id,person_id);
      CREATE TABLE tournaments.league_place_recipients (
        league_id INTEGER NOT NULL REFERENCES tournaments.leagues ON DELETE CASCADE,
        tournament_id INTEGER NOT NULL,
        participant_id INTEGER NOT NULL,
        person_id INTEGER NOT NULL,
        confirmed_by INTEGER REFERENCES accounts.users ON DELETE SET NULL,
        confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (league_id,tournament_id,participant_id),
        FOREIGN KEY (league_id,person_id) REFERENCES tournaments.league_people(league_id,id) ON DELETE CASCADE,
        FOREIGN KEY (participant_id,tournament_id) REFERENCES tournaments.tournament_participants(id,tournament_id) ON DELETE CASCADE
      );
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='kt_tournaments') THEN
          GRANT SELECT,INSERT,UPDATE,DELETE ON tournaments.leagues,tournaments.league_rules,
            tournaments.league_tournaments,tournaments.league_people,tournaments.league_person_bindings,
            tournaments.league_place_recipients TO kt_tournaments;
          GRANT USAGE,SELECT ON SEQUENCE tournaments.leagues_id_seq,tournaments.league_people_id_seq TO kt_tournaments;
        END IF;
      END $$;
    `);
  }
};
