module.exports = {
  version: 116,
  name: 'tournament_providers',
  async up(client) {
    await client.query(`
      CREATE TABLE tournaments.tournament_providers (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
        name_key TEXT NOT NULL UNIQUE,
        logo_data TEXT NOT NULL CHECK (logo_data <> ''),
        logo_version TEXT GENERATED ALWAYS AS (left(encode(sha256(logo_data::bytea), 'hex'), 16)) STORED,
        city TEXT NOT NULL CHECK (char_length(btrim(city)) BETWEEN 1 AND 80),
        description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 6000),
        created_by_user_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        owner_user_id INTEGER NOT NULL REFERENCES accounts.users(id),
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      CREATE TABLE tournaments.tournament_provider_memberships (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES tournaments.tournament_providers(id) ON DELETE RESTRICT,
        user_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        role TEXT NOT NULL CHECK (role IN ('organizer', 'judge')),
        joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        ended_at TIMESTAMPTZ,
        active_organizer_user_id INTEGER GENERATED ALWAYS AS (
          CASE WHEN role = 'organizer' AND ended_at IS NULL THEN user_id END
        ) STORED,
        UNIQUE (provider_id, active_organizer_user_id)
      );

      CREATE UNIQUE INDEX tournament_provider_memberships_active_user_idx
        ON tournaments.tournament_provider_memberships (provider_id, user_id) WHERE ended_at IS NULL;
      CREATE INDEX tournament_provider_memberships_user_idx
        ON tournaments.tournament_provider_memberships (user_id) WHERE user_id IS NOT NULL;

      -- A deferred FK lets a transaction install or replace the owner and their membership together.
      ALTER TABLE tournaments.tournament_providers
        ADD CONSTRAINT tournament_providers_active_owner_fkey
        FOREIGN KEY (id, owner_user_id)
        REFERENCES tournaments.tournament_provider_memberships (provider_id, active_organizer_user_id)
        DEFERRABLE INITIALLY DEFERRED;

      CREATE TABLE tournaments.tournament_provider_invitations (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES tournaments.tournament_providers(id) ON DELETE RESTRICT,
        invitee_user_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        invited_by_user_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        role TEXT NOT NULL CHECK (role IN ('organizer', 'judge')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
        responded_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );

      CREATE UNIQUE INDEX tournament_provider_invitations_pending_invitee_idx
        ON tournaments.tournament_provider_invitations (provider_id, invitee_user_id) WHERE status = 'pending';
      CREATE INDEX tournament_provider_invitations_invitee_idx
        ON tournaments.tournament_provider_invitations (invitee_user_id, status);

      CREATE TABLE tournaments.tournament_provider_audit_events (
        id SERIAL PRIMARY KEY,
        provider_id INTEGER NOT NULL REFERENCES tournaments.tournament_providers(id) ON DELETE RESTRICT,
        actor_user_id INTEGER REFERENCES accounts.users(id) ON DELETE SET NULL,
        event_type TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        before JSONB,
        after JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
      );
      CREATE INDEX tournament_provider_audit_provider_idx
        ON tournaments.tournament_provider_audit_events (provider_id, created_at DESC, id DESC);

      ALTER TABLE tournaments.tournaments ADD COLUMN provider_id INTEGER
        REFERENCES tournaments.tournament_providers(id) ON DELETE RESTRICT;
      CREATE INDEX tournaments_provider_idx ON tournaments.tournaments (provider_id) WHERE provider_id IS NOT NULL;

      ALTER TABLE tournaments.calendar_events ADD COLUMN provider_id INTEGER
        REFERENCES tournaments.tournament_providers(id) ON DELETE RESTRICT;
      CREATE INDEX calendar_events_provider_idx ON tournaments.calendar_events (provider_id) WHERE provider_id IS NOT NULL;

      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'kt_tournaments') THEN
          GRANT SELECT, INSERT, UPDATE, DELETE ON
            tournaments.tournament_providers, tournaments.tournament_provider_memberships,
            tournaments.tournament_provider_invitations, tournaments.tournament_provider_audit_events
          TO kt_tournaments;
          GRANT USAGE, SELECT ON SEQUENCE
            tournaments.tournament_providers_id_seq, tournaments.tournament_provider_memberships_id_seq,
            tournaments.tournament_provider_invitations_id_seq, tournaments.tournament_provider_audit_events_id_seq
          TO kt_tournaments;
        END IF;
      END $$;
    `);
  }
};
