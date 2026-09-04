const SCHEMA = `
  ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS participant_mode TEXT NOT NULL DEFAULT 'individual',
    ADD COLUMN IF NOT EXISTS team_size INTEGER,
    ADD COLUMN IF NOT EXISTS pairing_type TEXT;

  ALTER TABLE tournaments
    DROP CONSTRAINT IF EXISTS tournaments_participant_mode_check,
    DROP CONSTRAINT IF EXISTS tournaments_team_mode_check,
    DROP CONSTRAINT IF EXISTS tournaments_pairing_type_check;

  ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_participant_mode_check CHECK (
      participant_mode IN ('individual', 'team')
    ),
    ADD CONSTRAINT tournaments_team_mode_check CHECK (
      participant_mode <> 'team' OR (format = 'swiss' AND team_size = 3)
    ),
    ADD CONSTRAINT tournaments_pairing_type_check CHECK (
      (participant_mode = 'individual' AND pairing_type IS NULL)
      OR (participant_mode = 'team' AND pairing_type = 'shield_sword')
    );

  CREATE TABLE IF NOT EXISTS player_teams (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    logo_data TEXT,
    leader_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating_tts INTEGER NOT NULL DEFAULT 1000,
    rating_irl INTEGER NOT NULL DEFAULT 1000,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS player_team_memberships (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES player_teams(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    display_name_snapshot TEXT NOT NULL,
    role TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    end_reason TEXT,
    ended_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT player_team_memberships_role_check CHECK (role IN ('leader', 'member')),
    CONSTRAINT player_team_memberships_end_reason_check CHECK (
      end_reason IS NULL OR end_reason IN ('left', 'removed', 'account_unavailable')
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_player_team_memberships_active_user
    ON player_team_memberships(team_id, user_id)
    WHERE ended_at IS NULL AND user_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_player_team_memberships_active_leader
    ON player_team_memberships(team_id)
    WHERE ended_at IS NULL AND role = 'leader';
  CREATE INDEX IF NOT EXISTS idx_player_team_memberships_user
    ON player_team_memberships(user_id, joined_at DESC);

  CREATE TABLE IF NOT EXISTS player_team_invitations (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES player_teams(id) ON DELETE CASCADE,
    invitee_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    CONSTRAINT player_team_invitations_status_check CHECK (
      status IN ('pending', 'accepted', 'declined', 'revoked')
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_player_team_invitations_pending
    ON player_team_invitations(team_id, invitee_user_id)
    WHERE status = 'pending';
  CREATE INDEX IF NOT EXISTS idx_player_team_invitations_invitee
    ON player_team_invitations(invitee_user_id, status, created_at DESC);

  CREATE TABLE IF NOT EXISTS tournament_team_rosters (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES player_teams(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    captain_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    registered_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    seed INTEGER,
    status TEXT NOT NULL DEFAULT 'registered',
    team_name_snapshot TEXT NOT NULL,
    team_logo_snapshot TEXT,
    final_place INTEGER,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournament_team_rosters_status_check CHECK (
      status IN ('registered', 'incomplete', 'active', 'withdrawn', 'finished')
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_team_rosters_active_name
    ON tournament_team_rosters(tournament_id, name_key)
    WHERE status <> 'withdrawn';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_team_rosters_active_seed
    ON tournament_team_rosters(tournament_id, seed)
    WHERE status IN ('registered', 'active', 'finished') AND seed IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_tournament_team_rosters_team
    ON tournament_team_rosters(team_id, registered_at DESC);

  CREATE TABLE IF NOT EXISTS tournament_team_roster_members (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    roster_id INTEGER NOT NULL REFERENCES tournament_team_rosters(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    slot SMALLINT NOT NULL,
    display_name_snapshot TEXT NOT NULL,
    faction_snapshot TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    replaced_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournament_team_roster_members_slot_check CHECK (slot BETWEEN 1 AND 3)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_team_roster_members_slot
    ON tournament_team_roster_members(roster_id, slot)
    WHERE ended_at IS NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_team_roster_members_tournament_user
    ON tournament_team_roster_members(tournament_id, user_id)
    WHERE ended_at IS NULL AND user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_tournament_team_roster_members_roster
    ON tournament_team_roster_members(roster_id, slot, joined_at);

  CREATE TABLE IF NOT EXISTS tournament_team_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id INTEGER NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    bracket_position INTEGER NOT NULL,
    roster_a_id INTEGER NOT NULL REFERENCES tournament_team_rosters(id) ON DELETE RESTRICT,
    roster_b_id INTEGER NOT NULL REFERENCES tournament_team_rosters(id) ON DELETE RESTRICT,
    phase TEXT NOT NULL DEFAULT 'awaiting_roll',
    roll_result SMALLINT,
    attacker_roster_id INTEGER REFERENCES tournament_team_rosters(id) ON DELETE SET NULL,
    defender_roster_id INTEGER REFERENCES tournament_team_rosters(id) ON DELETE SET NULL,
    shield_a_member_id INTEGER REFERENCES tournament_team_roster_members(id) ON DELETE SET NULL,
    shield_b_member_id INTEGER REFERENCES tournament_team_roster_members(id) ON DELETE SET NULL,
    shield_a_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    shield_b_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    sword_a_member_id INTEGER REFERENCES tournament_team_roster_members(id) ON DELETE SET NULL,
    sword_b_member_id INTEGER REFERENCES tournament_team_roster_members(id) ON DELETE SET NULL,
    sword_a_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    sword_b_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    pairings JSONB,
    missions JSONB,
    table_ids INTEGER[],
    environment JSONB,
    game_points JSONB,
    team_game_points_a INTEGER,
    team_game_points_b INTEGER,
    team_tournament_points_a INTEGER,
    team_tournament_points_b INTEGER,
    team_elo JSONB,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournament_team_matches_distinct_rosters_check CHECK (roster_a_id <> roster_b_id),
    CONSTRAINT tournament_team_matches_roll_check CHECK (roll_result IS NULL OR roll_result BETWEEN 1 AND 6),
    CONSTRAINT tournament_team_matches_phase_check CHECK (
      phase IN ('awaiting_roll', 'shield_selection', 'sword_selection', 'environment_selection', 'in_progress', 'completed')
    ),
    UNIQUE (round_id, bracket_position)
  );

  CREATE INDEX IF NOT EXISTS idx_tournament_team_matches_tournament
    ON tournament_team_matches(tournament_id, round_number, bracket_position);
  CREATE INDEX IF NOT EXISTS idx_tournament_team_matches_round
    ON tournament_team_matches(round_id);

  CREATE TABLE IF NOT EXISTS tournament_team_match_games (
    id SERIAL PRIMARY KEY,
    team_match_id INTEGER NOT NULL REFERENCES tournament_team_matches(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL UNIQUE REFERENCES games(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL,
    roster_a_member_id INTEGER NOT NULL REFERENCES tournament_team_roster_members(id) ON DELETE RESTRICT,
    roster_b_member_id INTEGER NOT NULL REFERENCES tournament_team_roster_members(id) ON DELETE RESTRICT,
    mission JSONB NOT NULL,
    table_id INTEGER REFERENCES tournament_tables(id) ON DELETE SET NULL,
    game_points_a INTEGER,
    game_points_b INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournament_team_match_games_slot_check CHECK (slot BETWEEN 1 AND 3),
    UNIQUE (team_match_id, slot)
  );

  CREATE INDEX IF NOT EXISTS idx_tournament_team_match_games_match
    ON tournament_team_match_games(team_match_id, slot);

  CREATE TABLE IF NOT EXISTS player_team_audit_events (
    id SERIAL PRIMARY KEY,
    team_id INTEGER REFERENCES player_teams(id) ON DELETE CASCADE,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    before JSONB,
    after JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_player_team_audit_team
    ON player_team_audit_events(team_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_player_team_audit_tournament
    ON player_team_audit_events(tournament_id, created_at DESC);
`;

module.exports = {
  version: 13,
  name: "player_teams",
  async up(client) {
    await client.query(SCHEMA);
  }
};
