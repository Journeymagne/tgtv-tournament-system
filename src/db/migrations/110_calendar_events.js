module.exports = {
  version: 110, name: 'calendar_events',
  async up(client) {
    await client.query(`CREATE TABLE tournaments.calendar_events (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
      event_date DATE NOT NULL CHECK (event_date BETWEEN '2000-01-01' AND '2099-12-31'),
      start_time TIME WITHOUT TIME ZONE,
      city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 80),
      venue TEXT NOT NULL CHECK (char_length(btrim(venue)) BETWEEN 1 AND 160),
      address TEXT NOT NULL DEFAULT '' CHECK (char_length(address) <= 300),
      tournament_type TEXT NOT NULL CHECK (tournament_type IN ('solo','teams','pairs')),
      participant_limit INTEGER NOT NULL CHECK (participant_limit BETWEEN 2 AND 10000),
      entry_fee NUMERIC(12,2) NOT NULL CHECK (entry_fee BETWEEN 0 AND 1000000),
      tournament_id INTEGER UNIQUE REFERENCES tournaments.tournaments(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
      CHECK (tournament_type <> 'teams' OR participant_limit >= 3)
    );
    CREATE INDEX calendar_events_date_idx ON tournaments.calendar_events(event_date,start_time,id);
    DO $$ BEGIN
      IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='kt_tournaments') THEN
        GRANT SELECT,INSERT,UPDATE,DELETE ON tournaments.calendar_events TO kt_tournaments;
        GRANT USAGE,SELECT ON SEQUENCE tournaments.calendar_events_id_seq TO kt_tournaments;
      END IF;
    END $$;`);
  }
};
