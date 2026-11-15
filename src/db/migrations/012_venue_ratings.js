const { recalculateCompletedGameRatings } = require("../../api/rating-replay");

const SCHEMA = `
  ALTER TABLE games
    ADD COLUMN IF NOT EXISTS venue_mode TEXT NOT NULL DEFAULT 'tts';

  ALTER TABLE games
    DROP CONSTRAINT IF EXISTS games_venue_mode_check;

  ALTER TABLE games
    ADD CONSTRAINT games_venue_mode_check CHECK (
      venue_mode IN ('tts','irl')
    );

  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rating_tts INTEGER,
    ADD COLUMN IF NOT EXISTS rating_irl INTEGER;

  UPDATE games g
  SET venue_mode = t.venue_mode
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE g.source_type = 'tournament_match'
    AND g.source_id = tm.id;

  UPDATE users
  SET rating_tts = COALESCE(rating_tts, rating),
      rating_irl = COALESCE(rating_irl, rating);

  ALTER TABLE users
    ALTER COLUMN rating_tts SET DEFAULT 1000,
    ALTER COLUMN rating_tts SET NOT NULL,
    ALTER COLUMN rating_irl SET DEFAULT 1000,
    ALTER COLUMN rating_irl SET NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_games_venue_completed
    ON games (venue_mode, submitted_at DESC, id DESC)
    WHERE status = 'completed';
`;

module.exports = {
  version: 12,
  name: "venue_ratings",
  async up(client) {
    await client.query(SCHEMA);
    await recalculateCompletedGameRatings(client, {
      splitFromLegacyRating: true,
      includeCombined: false
    });
  }
};
