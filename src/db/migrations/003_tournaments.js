const SCHEMA = `
  ALTER TABLE games
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'challenge',
    ADD COLUMN IF NOT EXISTS source_id INTEGER;

  CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    game_system TEXT NOT NULL DEFAULT 'Warhammer 40k Kill Team',
    starts_at TIMESTAMPTZ,
    rules_summary TEXT NOT NULL DEFAULT '',
    rules_link TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    format TEXT NOT NULL,
    swiss_round_count INTEGER,
    single_elimination_size INTEGER,
    tiebreaker_order TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    rating_policy TEXT NOT NULL DEFAULT 'ranked',
    challenge_credit_policy TEXT NOT NULL DEFAULT 'count',
    final_results JSONB,
    published_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournaments_status_check CHECK (
      status IN ('draft','registration_open','registration_closed','in_progress','completed','cancelled')
    ),
    CONSTRAINT tournaments_format_check CHECK (
      format IN ('single_elimination','swiss')
    ),
    CONSTRAINT tournaments_single_elimination_size_check CHECK (
      format <> 'single_elimination' OR single_elimination_size IN (8, 16, 32, 64)
    ),
    CONSTRAINT tournaments_rating_policy_check CHECK (
      rating_policy IN ('ranked','unranked')
    ),
    CONSTRAINT tournaments_challenge_credit_policy_check CHECK (
      challenge_credit_policy IN ('none','count')
    )
  );

  CREATE TABLE IF NOT EXISTS tournament_participants (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    display_name TEXT NOT NULL,
    display_name_key TEXT NOT NULL,
    faction TEXT,
    faction_rules TEXT,
    seed INTEGER,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    placed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournament_participants_status_check CHECK (
      status IN ('joined','active','pending_placement','withdrawn','removed','eliminated','finished')
    ),
    CONSTRAINT tournament_participants_source_check CHECK (
      source IN ('self_join','admin_manual','admin_bulk')
    )
  );

  CREATE TABLE IF NOT EXISTS tournament_rounds (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL,
    generated_by TEXT NOT NULL DEFAULT 'system',
    metadata JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE (tournament_id, round_number),
    CONSTRAINT tournament_rounds_status_check CHECK (
      status IN ('not_ready','active','completed')
    )
  );

  CREATE TABLE IF NOT EXISTS tournament_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id INTEGER NOT NULL REFERENCES tournament_rounds(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    bracket_position INTEGER,
    status TEXT NOT NULL,
    is_bye BOOLEAN NOT NULL DEFAULT FALSE,
    participant_a_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
    participant_b_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
    source_match_a_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
    source_match_b_id INTEGER REFERENCES tournament_matches(id) ON DELETE SET NULL,
    winner_participant_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
    pending_result JSONB,
    result JSONB,
    match_points JSONB,
    elo JSONB,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
    submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    CONSTRAINT tournament_matches_status_check CHECK (
      status IN ('not_ready','active','pending_confirmation','completed')
    )
  );

  CREATE TABLE IF NOT EXISTS tournament_audit_events (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    before JSONB,
    after JSONB,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_games_source ON games(source_type, source_id);
  CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
  CREATE INDEX IF NOT EXISTS idx_tournaments_owner_user_id ON tournaments(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_tournaments_starts_at ON tournaments(starts_at);
  CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_id
    ON tournament_participants(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_participants_user_id
    ON tournament_participants(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_participants_active_user
    ON tournament_participants(tournament_id, user_id)
    WHERE user_id IS NOT NULL AND status NOT IN ('withdrawn','removed');
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_participants_active_name
    ON tournament_participants(tournament_id, display_name_key)
    WHERE status NOT IN ('withdrawn','removed');
  CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament_id
    ON tournament_rounds(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id
    ON tournament_matches(tournament_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_matches_round_id
    ON tournament_matches(round_id);
  CREATE INDEX IF NOT EXISTS idx_tournament_matches_status
    ON tournament_matches(status);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_matches_game_id
    ON tournament_matches(game_id)
    WHERE game_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_tournament_audit_events_tournament_id
    ON tournament_audit_events(tournament_id, created_at DESC);
`;

module.exports = {
  version: 3,
  name: "tournaments",
  async up(client) {
    await client.query(SCHEMA);
  }
};
