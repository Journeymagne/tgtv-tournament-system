const { mapTournament, mapTournamentParticipant, mapTournamentMatch } = require("../rows");
const { mapTeamMatch, mapGameLink } = require("./team-matches");
const { mapRoster, mapRosterMember } = require("./team-rosters");

function group(rows, key) {
  const result = new Map();
  for (const row of rows) {
    if (!result.has(row[key])) result.set(row[key], []);
    result.get(row[key]).push(row);
  }
  return result;
}

// The caller supplies the transaction and the IDs it is authorized to expose.
// Query counts are bounded independently of the number of events and games.
async function loadLeagueEvents(client, tournamentIds) {
  if (!tournamentIds.length) return [];
  const read = async (sql, ids) => (await client.query(sql, [ids])).rows;
  const tournaments = (await read(
    `SELECT id, slug, name, starts_at, completed_at, status, participant_mode, pairing_type,
            format, swiss_round_count, team_size, tiebreaker_order, team_tiebreaker_order, final_results
     FROM tournaments.tournaments WHERE id = ANY($1::int[]) ORDER BY starts_at NULLS LAST, id`, tournamentIds)).map(mapTournament);
  const bundles = tournaments.map(tournament => ({
    tournament, participants: [], matches: [], rosters: [], teamMatches: [], replacedParticipantIds: []
  }));
  const solo = tournaments.filter(t => t.participantMode !== "team" && t.status === "completed").map(t => t.id);
  const teams = tournaments.filter(t => t.participantMode === "team" && t.status === "completed").map(t => t.id);
  if (solo.length) {
    const participants = group((await read(
      `SELECT p.id, p.tournament_id, p.user_id, p.display_name, p.faction, p.factions, p.is_proxy, p.status, u.register_nickname
       FROM tournaments.tournament_participants p LEFT JOIN accounts.users u ON u.id=p.user_id
       WHERE p.tournament_id = ANY($1::int[]) ORDER BY p.id`, solo))
      .map(row => ({ ...mapTournamentParticipant(row), registerNickname: row.register_nickname || "" })), "tournamentId");
    const matches = (await read(
      `SELECT id, tournament_id, round_number, status, is_bye, participant_snapshots, participant_a_id,
              participant_b_id, winner_participant_id, game_id, result
       FROM tournaments.tournament_match_results WHERE tournament_id = ANY($1::int[]) ORDER BY round_number, id`, solo))
      .map(mapTournamentMatch);
    // A bye has no game_participants row. Replacements freeze its occupant
    // in participant_snapshots, including people absent from the final seats.
    const snapshots = matches.flatMap(match => Object.values(match.participantSnapshots || {})).filter(Boolean);
    const snapshotIds = [...new Set(snapshots.map(side => side.userId).filter(Number.isInteger))];
    if (snapshotIds.length) {
      const profiles = new Map((await read(
        "SELECT id, register_nickname FROM accounts.users WHERE id=ANY($1::int[])", snapshotIds))
        .map(row => [row.id, row.register_nickname]));
      for (const side of snapshots) side.registerNickname = profiles.get(side.userId) || "";
    }
    const saved = group(await read(
      `SELECT gp.game_id, gp.tournament_participant_id, gp.user_id, gp.result_key, gp.display_name_snapshot,
              gp.faction_snapshot, gp.is_proxy, u.register_nickname
       FROM tournaments.game_participants gp LEFT JOIN accounts.users u ON u.id=gp.user_id
       WHERE gp.game_id = ANY($1::int[])`, matches.map(match => match.gameId).filter(Number.isInteger)), "game_id");
    for (const match of matches) {
      match.recorded = (saved.get(match.gameId) || []).map(row => ({
        participantId: row.tournament_participant_id, userId: row.user_id, resultKey: row.result_key,
        displayName: row.display_name_snapshot, faction: row.faction_snapshot, isProxy: row.is_proxy,
        registerNickname: row.register_nickname || ""
      }));
    }
    const matchesByTournament = group(matches, "tournamentId");
    const replacements = group(await read(
      `SELECT DISTINCT tournament_id, entity_id FROM tournaments.tournament_audit_events
       WHERE tournament_id = ANY($1::int[]) AND event_type='participant_replace' AND entity_type='participant'`, solo), "tournament_id");
    for (const bundle of bundles) {
      bundle.participants = participants.get(bundle.tournament.id) || [];
      bundle.matches = matchesByTournament.get(bundle.tournament.id) || [];
      bundle.replacedParticipantIds = (replacements.get(bundle.tournament.id) || []).map(row => Number(row.entity_id));
    }
  }
  if (teams.length) {
    const rosters = (await read(
      `SELECT r.id, r.tournament_id, r.team_id, r.name, r.status, r.team_name_snapshot,
              t.name AS current_team_name, t.slug AS team_slug FROM tournaments.tournament_team_rosters r
       LEFT JOIN tournaments.player_teams t ON t.id=r.team_id WHERE r.tournament_id=ANY($1::int[]) ORDER BY r.id`, teams)).map(mapRoster);
    const members = group((await read(
      `SELECT id, tournament_id, roster_id, user_id, slot, display_name_snapshot, faction_snapshot, factions,
              joined_at, ended_at, is_proxy FROM tournaments.tournament_team_roster_members
       WHERE tournament_id=ANY($1::int[]) ORDER BY roster_id, slot, joined_at, id`, teams)).map(mapRosterMember), "rosterId");
    for (const roster of rosters) roster.members = members.get(roster.id) || [];
    const matches = (await read(
      `SELECT id, tournament_id, roster_a_id, roster_b_id, phase, resolution, pairing_type, team_size, game_points,
              team_game_points_a, team_game_points_b, team_tournament_points_a, team_tournament_points_b
       FROM tournaments.tournament_team_matches WHERE tournament_id=ANY($1::int[]) ORDER BY round_number, id`, teams)).map(mapTeamMatch);
    const links = (await read(
      `SELECT l.id, l.team_match_id, l.game_id, l.slot, l.roster_a_member_id, l.roster_b_member_id,
              g.status AS game_status, g.result, g.player_ids
       FROM tournaments.tournament_team_match_games l JOIN tournaments.games g ON g.id=l.game_id
       WHERE l.team_match_id=ANY($1::int[]) ORDER BY l.team_match_id, l.slot`, matches.map(match => match.id)));
    const players = group(await read(
      `SELECT game_id, slot, result_key, user_id, display_name_snapshot FROM tournaments.game_participants
       WHERE game_id=ANY($1::int[]) ORDER BY game_id, slot`, links.map(link => link.game_id)), "game_id");
    const games = group(links.map(link => mapGameLink({ ...link, game_players: (players.get(link.game_id) || []).map(row =>
      ({ id: row.result_key, userId: row.user_id, name: row.display_name_snapshot })) })), "teamMatchId");
    for (const match of matches) match.games = games.get(match.id) || [];
    const rostersByTournament = group(rosters, "tournamentId");
    const matchesByTournament = group(matches, "tournamentId");
    for (const bundle of bundles) {
      bundle.rosters = rostersByTournament.get(bundle.tournament.id) || [];
      bundle.teamMatches = matchesByTournament.get(bundle.tournament.id) || [];
    }
  }
  return bundles;
}

module.exports = { loadLeagueEvents };

