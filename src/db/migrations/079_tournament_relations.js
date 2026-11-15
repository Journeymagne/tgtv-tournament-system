// Do not guess how to repair contradictory legacy links. Validating the FKs
// rolls this entire migration back if existing data needs an explicit repair.
module.exports = {
  version: 79,
  name: 'tournament_relations',
  async up(client) {
    await client.query(`
      LOCK TABLE tournaments.games, tournaments.tournament_team_match_games,
        tournaments.tournament_team_matches IN SHARE ROW EXCLUSIVE MODE;
      ALTER TABLE tournaments.games ADD COLUMN source_slot SMALLINT NOT NULL DEFAULT 0;
      UPDATE tournaments.games SET source_id=challenge_id WHERE source_type='challenge' AND source_id IS NULL AND challenge_id IS NOT NULL;
      UPDATE tournaments.games g SET source_slot=l.slot
        FROM tournaments.tournament_team_match_games l WHERE l.game_id=g.id AND g.source_type='team_match_game';
      ALTER TABLE tournaments.games ADD CONSTRAINT games_source_slot_check CHECK (
        (source_type='team_match_game' AND source_id IS NOT NULL AND source_slot BETWEEN 1 AND 3)
        OR (source_type<>'team_match_game' AND source_slot=0));
      ALTER TABLE tournaments.games ADD CONSTRAINT games_tournament_source_required
        CHECK(source_type<>'tournament_match' OR source_id IS NOT NULL);
      ALTER TABLE tournaments.games ADD CONSTRAINT games_challenge_source_identity
        CHECK(source_type<>'challenge' OR challenge_id IS NULL OR source_id IS NOT DISTINCT FROM challenge_id);
      -- A team source is the parent match plus personal-game slot, not just the match.
      CREATE UNIQUE INDEX games_source_identity ON tournaments.games(source_type,source_id,source_slot)
        WHERE source_id IS NOT NULL;
      CREATE UNIQUE INDEX games_team_link_identity ON tournaments.games(id,source_id,source_slot);
      DROP INDEX tournaments.idx_games_source;
      CREATE FUNCTION tournaments.fill_challenge_game_source() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.source_type='challenge' AND NEW.challenge_id IS NOT NULL THEN
          IF NEW.source_id IS NOT NULL AND NEW.source_id<>NEW.challenge_id THEN
            RAISE EXCEPTION 'Challenge game source must equal challenge_id' USING ERRCODE='23514'; END IF;
          NEW.source_id:=NEW.challenge_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER challenge_game_source BEFORE INSERT OR UPDATE OF challenge_id,source_type,source_id ON tournaments.games
        FOR EACH ROW EXECUTE FUNCTION tournaments.fill_challenge_game_source();

      CREATE UNIQUE INDEX tournament_tables_identity_scope ON tournaments.tournament_tables(id,tournament_id);
      CREATE UNIQUE INDEX tournament_matches_identity_scope ON tournaments.tournament_matches(id,tournament_id);
      CREATE UNIQUE INDEX tournament_rosters_identity_scope ON tournaments.tournament_team_rosters(id,tournament_id);
      CREATE UNIQUE INDEX tournament_roster_members_identity_scope ON tournaments.tournament_team_roster_members(id,roster_id);
      CREATE UNIQUE INDEX tournament_team_matches_identity_scope ON tournaments.tournament_team_matches(id,tournament_id,roster_a_id,roster_b_id);

      ALTER TABLE tournaments.tournament_matches
        ADD CONSTRAINT tournament_match_table_scope FOREIGN KEY(table_id,tournament_id)
          REFERENCES tournaments.tournament_tables(id,tournament_id) ON DELETE SET NULL (table_id),
        ADD CONSTRAINT tournament_match_source_a_scope FOREIGN KEY(source_match_a_id,tournament_id)
          REFERENCES tournaments.tournament_matches(id,tournament_id) ON DELETE SET NULL (source_match_a_id),
        ADD CONSTRAINT tournament_match_source_b_scope FOREIGN KEY(source_match_b_id,tournament_id)
          REFERENCES tournaments.tournament_matches(id,tournament_id) ON DELETE SET NULL (source_match_b_id);
    `);
    await client.query(`
      ALTER TABLE tournaments.tournament_team_roster_members ADD CONSTRAINT tournament_roster_member_scope
        FOREIGN KEY(roster_id,tournament_id) REFERENCES tournaments.tournament_team_rosters(id,tournament_id) ON DELETE CASCADE;
      ALTER TABLE tournaments.tournament_team_matches
        ADD CONSTRAINT tournament_team_match_round_scope FOREIGN KEY(round_id,tournament_id)
          REFERENCES tournaments.tournament_rounds(id,tournament_id) ON DELETE CASCADE,
        ADD CONSTRAINT tournament_team_match_a_scope FOREIGN KEY(roster_a_id,tournament_id)
          REFERENCES tournaments.tournament_team_rosters(id,tournament_id) ON DELETE RESTRICT,
        ADD CONSTRAINT tournament_team_match_b_scope FOREIGN KEY(roster_b_id,tournament_id)
          REFERENCES tournaments.tournament_team_rosters(id,tournament_id) ON DELETE RESTRICT,
        ADD CONSTRAINT tournament_team_match_attacker_side CHECK(attacker_roster_id IS NULL OR COALESCE(attacker_roster_id IN (roster_a_id,roster_b_id),FALSE)),
        ADD CONSTRAINT tournament_team_match_defender_side CHECK(defender_roster_id IS NULL OR COALESCE(defender_roster_id IN (roster_a_id,roster_b_id),FALSE)),
        ADD CONSTRAINT tournament_team_match_roles_distinct CHECK(attacker_roster_id IS NULL OR defender_roster_id IS NULL OR attacker_roster_id<>defender_roster_id);
    `);
    for (const side of ['a', 'b']) {
      for (const choice of ['shield', 'sword']) {
        const column = `${choice}_${side}_member_id`;
        // A captain nominates their own shield and the opponent's sword.
        const rosterSide = choice === 'shield' ? side : side === 'a' ? 'b' : 'a';
        await client.query(`ALTER TABLE tournaments.tournament_team_matches ADD CONSTRAINT team_match_${choice}_${side}_scope
          FOREIGN KEY(${column},roster_${rosterSide}_id) REFERENCES tournaments.tournament_team_roster_members(id,roster_id)
          ON DELETE SET NULL (${column}),
          ADD CONSTRAINT team_match_${choice}_${side}_requires_roster
            CHECK(${column} IS NULL OR roster_${rosterSide}_id IS NOT NULL)`);
      }
    }
    await client.query(`
      ALTER TABLE tournaments.tournament_team_match_games
        ADD COLUMN tournament_id INTEGER,
        ADD COLUMN roster_a_id INTEGER,
        ADD COLUMN roster_b_id INTEGER;
      UPDATE tournaments.tournament_team_match_games l SET tournament_id=m.tournament_id,
        roster_a_id=m.roster_a_id,roster_b_id=m.roster_b_id FROM tournaments.tournament_team_matches m WHERE m.id=l.team_match_id;
      ALTER TABLE tournaments.tournament_team_match_games
        ALTER COLUMN tournament_id SET NOT NULL, ALTER COLUMN roster_a_id SET NOT NULL, ALTER COLUMN roster_b_id SET NOT NULL,
        ADD CONSTRAINT team_game_match_scope FOREIGN KEY(team_match_id,tournament_id,roster_a_id,roster_b_id)
          REFERENCES tournaments.tournament_team_matches(id,tournament_id,roster_a_id,roster_b_id) ON DELETE CASCADE,
        ADD CONSTRAINT team_game_member_a_scope FOREIGN KEY(roster_a_member_id,roster_a_id)
          REFERENCES tournaments.tournament_team_roster_members(id,roster_id) ON DELETE RESTRICT,
        ADD CONSTRAINT team_game_member_b_scope FOREIGN KEY(roster_b_member_id,roster_b_id)
          REFERENCES tournaments.tournament_team_roster_members(id,roster_id) ON DELETE RESTRICT,
        ADD CONSTRAINT team_game_table_scope FOREIGN KEY(table_id,tournament_id)
          REFERENCES tournaments.tournament_tables(id,tournament_id) ON DELETE SET NULL (table_id),
        ADD CONSTRAINT team_game_source_scope FOREIGN KEY(game_id,team_match_id,slot)
          REFERENCES tournaments.games(id,source_id,source_slot) ON DELETE CASCADE;

      CREATE FUNCTION tournaments.guard_team_game_scope() RETURNS trigger LANGUAGE plpgsql
        SET search_path=pg_catalog,tournaments,pg_temp AS $$
      DECLARE parent tournament_team_matches%ROWTYPE;
      BEGIN
        SELECT * INTO STRICT parent FROM tournament_team_matches WHERE id=NEW.team_match_id FOR KEY SHARE;
        NEW.tournament_id:=parent.tournament_id; NEW.roster_a_id:=parent.roster_a_id; NEW.roster_b_id:=parent.roster_b_id;
        IF NOT EXISTS(SELECT 1 FROM games WHERE id=NEW.game_id AND source_type='team_match_game'
          AND source_id=NEW.team_match_id AND source_slot=NEW.slot) THEN
          RAISE EXCEPTION 'Team game source must match parent and slot' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER team_game_scope BEFORE INSERT OR UPDATE ON tournaments.tournament_team_match_games
        FOR EACH ROW EXECUTE FUNCTION tournaments.guard_team_game_scope();
      -- Reject contradictory links already present before the trigger existed.
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM tournaments.tournament_team_match_games l JOIN tournaments.games g ON g.id=l.game_id
          WHERE g.source_type<>'team_match_game' OR g.source_id IS DISTINCT FROM l.team_match_id OR g.source_slot<>l.slot) THEN
          RAISE EXCEPTION 'Legacy team game source conflict; restore/repair explicitly before migration 079';
        END IF;
      END $$;
    `);
    for (const name of ['tournament_match_winner_side', 'tournament_match_distinct_sides',
      'tournament_match_a_scope', 'tournament_match_b_scope', 'tournament_match_round_scope']) {
      await client.query(`ALTER TABLE tournaments.tournament_matches VALIDATE CONSTRAINT ${name}`);
    }
  }
};
