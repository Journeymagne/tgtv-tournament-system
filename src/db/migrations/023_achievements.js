module.exports = {
  version: 23,
  name: "achievements",
  async up(client) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS achievements (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('player', 'team')),
        image_data TEXT,
        emoji TEXT NOT NULL DEFAULT '🏅',
        tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
        place INTEGER CHECK (place BETWEEN 1 AND 3),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((tournament_id IS NULL) = (place IS NULL)),
        UNIQUE (tournament_id, place)
      );
      CREATE TABLE IF NOT EXISTS achievement_awards (
        id SERIAL PRIMARY KEY,
        achievement_id INTEGER NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        team_id INTEGER REFERENCES player_teams(id) ON DELETE CASCADE,
        awarded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK ((user_id IS NULL) <> (team_id IS NULL)),
        UNIQUE (achievement_id, user_id),
        UNIQUE (achievement_id, team_id)
      );
      CREATE INDEX IF NOT EXISTS achievement_awards_user ON achievement_awards(user_id);
      CREATE INDEX IF NOT EXISTS achievement_awards_team ON achievement_awards(team_id);
    `);
  }
};
