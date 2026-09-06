const { recalculateCompletedGameRatings } = require("../../api/rating-replay");

const SCHEMA = `
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS rating_combined INTEGER;

  UPDATE users
  SET rating_combined = 1000
  WHERE rating_combined IS NULL;

  ALTER TABLE users
    ALTER COLUMN rating_combined SET DEFAULT 1000,
    ALTER COLUMN rating_combined SET NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_users_rating_combined
    ON users (rating_combined DESC, name ASC);
`;

module.exports = {
  version: 15,
  name: "combined_rating",
  async up(client) {
    await client.query(SCHEMA);
    await recalculateCompletedGameRatings(client, { resetCombined: true });
  }
};
