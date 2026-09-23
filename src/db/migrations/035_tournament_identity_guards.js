// Additive guards: retain integer IDs, URLs, game results and API compatibility.
// NOT VALID avoids rejecting deployment because of an unrelated legacy row;
// PostgreSQL still checks every new/changed row and foreign-key reference.
const CONSTRAINTS = {
  tournament_match_winner_side: `CHECK (
      winner_participant_id IS NULL OR
      COALESCE(winner_participant_id = participant_a_id, FALSE) OR
      COALESCE(winner_participant_id = participant_b_id, FALSE)
    ) NOT VALID`,
  tournament_match_distinct_sides: `CHECK (
      participant_a_id IS NULL OR participant_b_id IS NULL OR participant_a_id <> participant_b_id
    ) NOT VALID`,
  tournament_match_a_scope: `FOREIGN KEY (participant_a_id, tournament_id)
      REFERENCES tournament_participants(id, tournament_id) NOT VALID`,
  tournament_match_b_scope: `FOREIGN KEY (participant_b_id, tournament_id)
      REFERENCES tournament_participants(id, tournament_id) NOT VALID`,
  tournament_match_round_scope: `FOREIGN KEY (round_id, tournament_id)
      REFERENCES tournament_rounds(id, tournament_id) NOT VALID`
};

const SCHEMA = `
  CREATE UNIQUE INDEX IF NOT EXISTS tournament_participants_identity_scope ON tournament_participants(id, tournament_id);
  CREATE UNIQUE INDEX IF NOT EXISTS tournament_rounds_identity_scope ON tournament_rounds(id, tournament_id);
  ${Object.entries(CONSTRAINTS).map(([name, definition]) => `
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tournament_matches'::regclass AND conname = '${name}') THEN
        ALTER TABLE tournament_matches ADD CONSTRAINT ${name} ${definition};
      END IF;
    END $$;
  `).join('\n')}

  CREATE OR REPLACE FUNCTION guard_tournament_match_identity() RETURNS trigger LANGUAGE plpgsql AS $$
  DECLARE
    key_a INTEGER;
    key_b INTEGER;
    winner_key TEXT;
    expected_winner INTEGER;
  BEGIN
    IF NEW.game_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM games g WHERE g.id = NEW.game_id
        AND g.source_type = 'tournament_match' AND g.source_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Game does not belong to this tournament match' USING ERRCODE = '23514';
    END IF;
    IF NEW.is_bye OR NEW.status <> 'completed' OR NEW.result IS NULL THEN RETURN NEW; END IF;

    -- game_participants retains the exact original key even after account deletion.
    SELECT COALESCE(gp.result_key, p.user_id, -p.id) INTO key_a
      FROM tournament_participants p
      LEFT JOIN game_participants gp ON gp.game_id = NEW.game_id AND gp.tournament_participant_id = p.id
      WHERE p.id = NEW.participant_a_id AND p.tournament_id = NEW.tournament_id;
    SELECT COALESCE(gp.result_key, p.user_id, -p.id) INTO key_b
      FROM tournament_participants p
      LEFT JOIN game_participants gp ON gp.game_id = NEW.game_id AND gp.tournament_participant_id = p.id
      WHERE p.id = NEW.participant_b_id AND p.tournament_id = NEW.tournament_id;
    IF key_a IS NULL OR key_b IS NULL OR key_a = key_b THEN
      RAISE EXCEPTION 'Result requires two distinct participant identities' USING ERRCODE = '23514';
    END IF;
    winner_key := NEW.result->>'winnerId';
    expected_winner := CASE WHEN winner_key = key_a::text THEN NEW.participant_a_id
      WHEN winner_key = key_b::text THEN NEW.participant_b_id ELSE NULL END;
    IF (winner_key IS NOT NULL AND expected_winner IS NULL) OR
       NEW.winner_participant_id IS DISTINCT FROM expected_winner THEN
      RAISE EXCEPTION 'Game winner must be explicitly mapped to winner_participant_id' USING ERRCODE = '23514';
    END IF;
    NEW.result := jsonb_set(NEW.result, '{scoresByParticipantId}', jsonb_build_object(
      NEW.participant_a_id::text, COALESCE(NEW.result->'scores'->key_a::text, '{}'::jsonb),
      NEW.participant_b_id::text, COALESCE(NEW.result->'scores'->key_b::text, '{}'::jsonb)));
    RETURN NEW;
  END $$;

  DROP TRIGGER IF EXISTS tournament_match_identity_guard ON tournament_matches;
  CREATE TRIGGER tournament_match_identity_guard BEFORE INSERT OR UPDATE OF
    tournament_id, round_id, participant_a_id, participant_b_id, winner_participant_id,
    game_id, result, status, is_bye ON tournament_matches
    FOR EACH ROW EXECUTE FUNCTION guard_tournament_match_identity();
`;

module.exports = {
  version: 35,
  name: 'tournament_identity_guards',
  async up(client) {
    // Freeze only explicitly resolvable scores. Never guess using positive participant IDs.
    // Run before the guards so unresolvable old winners do not block startup.
    await client.query(`
      WITH scores AS (
        SELECT m.id, jsonb_object_agg(p.id::text,
          m.result->'scores'->COALESCE(gp.result_key, p.user_id, -p.id)::text) AS by_participant
        FROM tournament_matches m
        JOIN tournament_participants p ON p.id IN (m.participant_a_id, m.participant_b_id)
          AND p.tournament_id = m.tournament_id
        LEFT JOIN game_participants gp ON gp.game_id = m.game_id AND gp.tournament_participant_id = p.id
        WHERE m.result IS NOT NULL AND NOT (m.result ? 'scoresByParticipantId')
          AND m.result->'scores' ? COALESCE(gp.result_key, p.user_id, -p.id)::text
        GROUP BY m.id
      )
      UPDATE tournament_matches m SET result = jsonb_set(m.result, '{scoresByParticipantId}', s.by_participant)
      FROM scores s WHERE m.id = s.id
    `);
    await client.query(SCHEMA);
  }
};
