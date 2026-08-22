const SCHEMA = `
  CREATE TABLE IF NOT EXISTS game_participants (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    slot SMALLINT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    tournament_participant_id INTEGER REFERENCES tournament_participants(id) ON DELETE SET NULL,
    result_key INTEGER NOT NULL,
    display_name_snapshot TEXT NOT NULL,
    faction_snapshot TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT game_participants_slot_check CHECK (slot IN (1, 2)),
    UNIQUE (game_id, slot),
    UNIQUE (game_id, result_key)
  );

  CREATE INDEX IF NOT EXISTS idx_game_participants_user_id
    ON game_participants(user_id)
    WHERE user_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_game_participants_tournament_participant_id
    ON game_participants(tournament_participant_id)
    WHERE tournament_participant_id IS NOT NULL;

  -- Expand/backfill release: every playable tournament match becomes a real
  -- game, including matches containing a participant without an account.
  WITH missing_matches AS (
    SELECT
      tm.id AS match_id,
      ARRAY_REMOVE(ARRAY[pa.user_id, pb.user_id]::integer[], NULL) AS player_ids,
      CASE tm.status
        WHEN 'pending_confirmation' THEN 'pending_confirmation'
        WHEN 'completed' THEN 'completed'
        ELSE 'open'
      END AS game_status,
      tm.submitted_by_user_id,
      CASE
        WHEN tm.status = 'completed' THEN COALESCE(tm.completed_at, tm.updated_at, tm.created_at)
        WHEN tm.status = 'pending_confirmation' THEN COALESCE(tm.updated_at, tm.created_at)
        ELSE NULL
      END AS submitted_at,
      tm.pending_result,
      tm.result,
      tm.elo
    FROM tournament_matches tm
    JOIN tournament_participants pa ON pa.id = tm.participant_a_id
    JOIN tournament_participants pb ON pb.id = tm.participant_b_id
    WHERE tm.is_bye = FALSE
      AND tm.status IN ('active', 'pending_confirmation', 'completed')
      AND tm.game_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM games existing
        WHERE existing.source_type = 'tournament_match'
          AND existing.source_id = tm.id
      )
  )
  INSERT INTO games (
    challenge_id, player_ids, status, source_type, source_id,
    submitted_by, submitted_at, pending_result, result, elo
  )
  SELECT
    NULL, player_ids, game_status, 'tournament_match', match_id,
    submitted_by_user_id, submitted_at, pending_result, result, elo
  FROM missing_matches;

  -- Repair links for both newly inserted games and an interrupted older
  -- deployment which inserted the game but did not update the match yet.
  UPDATE tournament_matches tm
  SET game_id = g.id, updated_at = NOW()
  FROM games g
  WHERE tm.game_id IS NULL
    AND g.source_type = 'tournament_match'
    AND g.source_id = tm.id;

  -- During the compatibility window Game is canonical, while the existing
  -- match columns remain populated for the old tournament screens.
  UPDATE games g
  SET
    player_ids = ARRAY_REMOVE(ARRAY[pa.user_id, pb.user_id]::integer[], NULL),
    status = CASE tm.status
      WHEN 'pending_confirmation' THEN 'pending_confirmation'
      WHEN 'completed' THEN 'completed'
      ELSE 'open'
    END,
    submitted_by = tm.submitted_by_user_id,
    submitted_at = CASE
      WHEN tm.status = 'completed' THEN COALESCE(g.submitted_at, tm.completed_at, tm.updated_at, tm.created_at)
      WHEN tm.status = 'pending_confirmation' THEN COALESCE(g.submitted_at, tm.updated_at, tm.created_at)
      ELSE NULL
    END,
    pending_result = tm.pending_result,
    result = tm.result,
    elo = tm.elo
  FROM tournament_matches tm
  JOIN tournament_participants pa ON pa.id = tm.participant_a_id
  JOIN tournament_participants pb ON pb.id = tm.participant_b_id
  WHERE tm.game_id = g.id
    AND tm.is_bye = FALSE
    AND tm.status IN ('active', 'pending_confirmation', 'completed');

  -- Existing ordinary games get the same normalized participant records.
  INSERT INTO game_participants (
    game_id, slot, user_id, result_key, display_name_snapshot
  )
  SELECT g.id, player.ordinality::smallint, u.id, u.id, u.name
  FROM games g
  CROSS JOIN LATERAL UNNEST(g.player_ids) WITH ORDINALITY AS player(user_id, ordinality)
  JOIN users u ON u.id = player.user_id
  WHERE player.ordinality <= 2
  ON CONFLICT (game_id, slot) DO NOTHING;

  -- Tournament participant snapshots preserve guest identity. Registered
  -- users still retain user_id, so nickname changes do not create a new user.
  INSERT INTO game_participants (
    game_id, slot, user_id, tournament_participant_id, result_key,
    display_name_snapshot, faction_snapshot
  )
  SELECT
    g.id,
    side.slot,
    tp.user_id,
    tp.id,
    COALESCE(tp.user_id, -tp.id),
    COALESCE(NULLIF(tp.display_name, ''), u.name, 'Player'),
    COALESCE(tp.faction, '')
  FROM tournament_matches tm
  JOIN games g ON g.id = tm.game_id
  CROSS JOIN LATERAL (
    VALUES (1::smallint, tm.participant_a_id), (2::smallint, tm.participant_b_id)
  ) AS side(slot, participant_id)
  JOIN tournament_participants tp ON tp.id = side.participant_id
  LEFT JOIN users u ON u.id = tp.user_id
  WHERE tm.is_bye = FALSE
    AND tm.participant_a_id IS NOT NULL
    AND tm.participant_b_id IS NOT NULL
  ON CONFLICT (game_id, slot) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    tournament_participant_id = EXCLUDED.tournament_participant_id,
    result_key = EXCLUDED.result_key,
    display_name_snapshot = EXCLUDED.display_name_snapshot,
    faction_snapshot = EXCLUDED.faction_snapshot;
`;

module.exports = {
  version: 10,
  name: "canonical_tournament_games",
  async up(client) {
    await client.query(SCHEMA);
  }
};
