const SCHEMA = `
  WITH missing AS (
    SELECT
      tm.id AS match_id,
      tm.result,
      tm.elo,
      tm.submitted_by_user_id,
      COALESCE(tm.completed_at, tm.created_at) AS submitted_at,
      ARRAY[pa.user_id, pb.user_id]::integer[] AS player_ids
    FROM tournament_matches tm
    JOIN tournament_participants pa ON pa.id = tm.participant_a_id
    JOIN tournament_participants pb ON pb.id = tm.participant_b_id
    WHERE tm.status = 'completed'
      AND tm.is_bye = FALSE
      AND tm.result IS NOT NULL
      AND tm.game_id IS NULL
      AND pa.user_id IS NOT NULL
      AND pb.user_id IS NOT NULL
  ),
  inserted AS (
    INSERT INTO games (
      challenge_id, player_ids, status, source_type, source_id,
      submitted_by, submitted_at, pending_result, result, elo
    )
    SELECT
      NULL, player_ids, 'completed', 'tournament_match', match_id,
      submitted_by_user_id, submitted_at, NULL, result, elo
    FROM missing
    RETURNING id, source_id
  )
  UPDATE tournament_matches tm
  SET game_id = inserted.id, updated_at = NOW()
  FROM inserted
  WHERE tm.id = inserted.source_id;
`;

module.exports = {
  version: 6,
  name: "tournament_game_backfill",
  async up(client) {
    await client.query(SCHEMA);
  }
};
