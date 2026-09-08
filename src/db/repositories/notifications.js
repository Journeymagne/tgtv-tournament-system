const { toIso } = require("../rows");
const { avatarUrl } = require("../../domain/avatars");

function person(id, name, avatarVersion = null) {
  if (!id && !name) return null;
  return { id: id || null, name: name || "", avatarUrl: avatarUrl(id, avatarVersion) };
}

async function getLastSeenAt(client, userId) {
  const { rows } = await client.query(
    "SELECT last_seen_at FROM notification_inbox_state WHERE user_id = $1",
    [userId]
  );
  return toIso(rows[0]?.last_seen_at);
}

async function markReadThrough(client, userId, through) {
  const { rows } = await client.query(
    `INSERT INTO notification_inbox_state (user_id, last_seen_at, updated_at)
     VALUES ($1, LEAST($2::timestamptz, NOW()), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       last_seen_at = GREATEST(
         COALESCE(notification_inbox_state.last_seen_at, '-infinity'::timestamptz),
         LEAST(EXCLUDED.last_seen_at, NOW())
       ),
       updated_at = NOW()
     RETURNING last_seen_at`,
    [userId, through]
  );
  return toIso(rows[0]?.last_seen_at);
}

async function listChallenges(client, userId) {
  const { rows } = await client.query(
    `SELECT c.id, c.created_at, u.id AS actor_id, u.name AS actor_name,
            u.avatar_version AS actor_avatar
     FROM challenges c
     LEFT JOIN users u ON u.id = c.from_user_id
     WHERE c.to_user_id = $1 AND c.status = 'pending'`,
    [userId]
  );
  return rows.map((row) => ({
    id: `game_challenge:${row.id}`,
    type: "game_challenge",
    sourceId: row.id,
    createdAt: toIso(row.created_at),
    actor: person(row.actor_id, row.actor_name, row.actor_avatar),
    href: `#/mygames/challenge/${row.id}`
  }));
}

async function listTeamInvitations(client, userId) {
  const { rows } = await client.query(
    `SELECT invitation.id, invitation.created_at,
            team.id AS team_id, team.slug AS team_slug, team.name AS team_name,
            inviter.id AS actor_id, inviter.name AS actor_name,
            inviter.avatar_version AS actor_avatar
     FROM player_team_invitations invitation
     JOIN player_teams team ON team.id = invitation.team_id
     LEFT JOIN users inviter ON inviter.id = invitation.invited_by_user_id
     WHERE invitation.invitee_user_id = $1
       AND invitation.status = 'pending'
       AND team.archived_at IS NULL`,
    [userId]
  );
  return rows.map((row) => ({
    id: `team_invitation:${row.id}`,
    type: "team_invitation",
    sourceId: row.id,
    createdAt: toIso(row.created_at),
    actor: person(row.actor_id, row.actor_name, row.actor_avatar),
    team: { id: row.team_id, slug: row.team_slug, name: row.team_name },
    href: `#/teams/invitation/${row.id}`
  }));
}

async function listTournamentPairings(client, userId) {
  const { rows } = await client.query(
    `SELECT game.id AS game_id, game.created_at,
            tournament_match.id AS match_id, tournament_match.round_number, tournament_match.mission,
            tournament.id AS tournament_id, tournament.slug AS tournament_slug,
            tournament.name AS tournament_name,
            opponent.user_id AS opponent_id,
            opponent.display_name_snapshot AS opponent_name,
            opponent.faction_snapshot AS opponent_faction,
            opponent_user.avatar_version AS opponent_avatar,
            tournament_table.id AS table_id, tournament_table.table_number,
            tournament_table.killzone, tournament_table.deployment
     FROM games game
     JOIN game_participants mine
       ON mine.game_id = game.id AND mine.user_id = $1
     JOIN game_participants opponent
       ON opponent.game_id = game.id AND opponent.slot <> mine.slot
     LEFT JOIN users opponent_user ON opponent_user.id = opponent.user_id
     JOIN tournament_matches tournament_match ON tournament_match.id = game.source_id
     JOIN tournaments tournament ON tournament.id = tournament_match.tournament_id
     LEFT JOIN tournament_tables tournament_table ON tournament_table.id = tournament_match.table_id
     WHERE game.source_type = 'tournament_match'
       AND game.status IN ('open', 'pending_confirmation')
       AND tournament.status = 'in_progress'
       AND tournament_match.is_bye = FALSE`,
    [userId]
  );
  return rows.map((row) => ({
    id: `tournament_pairing:${row.game_id}`,
    type: "tournament_pairing",
    sourceId: row.match_id,
    gameId: row.game_id,
    createdAt: toIso(row.created_at),
    tournament: { id: row.tournament_id, slug: row.tournament_slug, name: row.tournament_name },
    opponent: person(row.opponent_id, row.opponent_name, row.opponent_avatar),
    opponentFaction: row.opponent_faction || "",
    roundNumber: row.round_number,
    mission: row.mission || null,
    table: row.table_id
      ? {
          id: row.table_id,
          number: row.table_number,
          killzone: row.killzone || "",
          deployment: row.deployment
        }
      : null,
    href: `#/games/tournament-match/${row.match_id}`
  }));
}

async function listTeamTournamentPairings(client, userId) {
  const { rows } = await client.query(
    `SELECT game.id AS game_id, game.created_at,
            team_match.id AS team_match_id, team_match.round_number,
            link.slot, link.mission,
            tournament.id AS tournament_id, tournament.slug AS tournament_slug,
            tournament.name AS tournament_name,
            opponent.user_id AS opponent_id,
            opponent.display_name_snapshot AS opponent_name,
            opponent.faction_snapshot AS opponent_faction,
            opponent_user.avatar_version AS opponent_avatar,
            roster_a.id AS roster_a_id, roster_a.name AS roster_a_name,
            roster_b.id AS roster_b_id, roster_b.name AS roster_b_name,
            member_a.user_id AS roster_a_user_id,
            tournament_table.id AS table_id, tournament_table.table_number,
            tournament_table.killzone, tournament_table.deployment
     FROM games game
     JOIN game_participants mine
       ON mine.game_id = game.id AND mine.user_id = $1
     JOIN game_participants opponent
       ON opponent.game_id = game.id AND opponent.slot <> mine.slot
     LEFT JOIN users opponent_user ON opponent_user.id = opponent.user_id
     JOIN tournament_team_match_games link ON link.game_id = game.id
     JOIN tournament_team_matches team_match ON team_match.id = link.team_match_id
     JOIN tournaments tournament ON tournament.id = team_match.tournament_id
     JOIN tournament_team_rosters roster_a ON roster_a.id = team_match.roster_a_id
     JOIN tournament_team_rosters roster_b ON roster_b.id = team_match.roster_b_id
     JOIN tournament_team_roster_members member_a ON member_a.id = link.roster_a_member_id
     LEFT JOIN tournament_tables tournament_table ON tournament_table.id = link.table_id
     WHERE game.source_type = 'team_match_game'
       AND game.status IN ('open', 'pending_confirmation')
       AND tournament.status = 'in_progress'
       AND team_match.phase = 'in_progress'`,
    [userId]
  );
  return rows.map((row) => {
    const onRosterA = Number(row.roster_a_user_id) === Number(userId);
    return {
      id: `team_tournament_pairing:${row.game_id}`,
      type: "team_tournament_pairing",
      sourceId: row.team_match_id,
      gameId: row.game_id,
      createdAt: toIso(row.created_at),
      tournament: { id: row.tournament_id, slug: row.tournament_slug, name: row.tournament_name },
      ownTeam: onRosterA
        ? { id: row.roster_a_id, name: row.roster_a_name }
        : { id: row.roster_b_id, name: row.roster_b_name },
      opponentTeam: onRosterA
        ? { id: row.roster_b_id, name: row.roster_b_name }
        : { id: row.roster_a_id, name: row.roster_a_name },
      opponent: person(row.opponent_id, row.opponent_name, row.opponent_avatar),
      opponentFaction: row.opponent_faction || "",
      roundNumber: row.round_number,
      pairingSlot: row.slot,
      mission: row.mission || null,
      table: row.table_id
        ? {
            id: row.table_id,
            number: row.table_number,
            killzone: row.killzone || "",
            deployment: row.deployment
          }
        : null,
      href: `#/games/game/${row.game_id}`
    };
  });
}

async function listActive(client, userId) {
  const groups = [
    await listChallenges(client, userId),
    await listTeamInvitations(client, userId),
    await listTournamentPairings(client, userId),
    await listTeamTournamentPairings(client, userId)
  ];
  return groups
    .flat()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
}

module.exports = { getLastSeenAt, markReadThrough, listActive };
