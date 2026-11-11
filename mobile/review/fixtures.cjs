// Fictional UI fixtures only; never imported by the application runtime.
const user = { id: 1, name: 'Journey', rating: 1184, ratings: { combined: 1184, irl: 1170, tts: 1200 }, isAdmin: true, isSuperAdmin: true, canCreateTournaments: true, managedTournamentIds: [1, 2], registerNickname: 'Journey', telegramContact: '@companion_demo' };
const participants = [{ id: 101, userId: 1, displayName: 'Journey', user, faction: 'Tempestus Aquilons', factions: ['Tempestus Aquilons'], paid: true, seed: 1, status: 'active' }, { id: 102, userId: 2, displayName: 'North', user: { id: 2, name: 'North' }, faction: 'Goremongers', factions: ['Goremongers'], paid: false, seed: 2, status: 'active' }];
const tournament = { id: 1, slug: 'companion-open', name: 'Companion Open', participantMode: 'individual', format: 'swiss', status: 'in_progress', venueMode: 'irl', venueAddress: 'Москва · клуб «Орбита»', startsAt: '2026-11-22T10:00:00+03:00', swissRoundCount: 3, participantCount: 2, factionCount: 1, updatedAt: '2026-11-11T10:00:00Z', viewer: { canAdmin: true, participantId: 101, canManageJudges: true }, description: 'Три раунда Kill Team. Данные этого просмотра вымышлены.' };
const tables = [{ id: 11, tableNumber: 1, killzone: 'Volkus', deployment: 1, updatedAt: '2026-11-11T10:00:00Z' }, { id: 12, tableNumber: 2, killzone: 'Volkus', deployment: 2, updatedAt: '2026-11-11T10:00:00Z' }];
const score = { 1: { crit: 4, kill: 3, tac: 3, primary: 'crit', total: 12, primaryBonus: 2, faction: 'Tempestus Aquilons' }, 2: { crit: 3, kill: 2, tac: 2, primary: 'crit', total: 9, primaryBonus: 2, faction: 'Goremongers' } };
const game = { resultRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', id: 701, status: 'open', sourceType: 'tournament_match', sourceId: 501, playerIds: [1, 2], players: participants.map(p => ({ id: p.userId, userId: p.userId, name: p.displayName, faction: p.faction })), tournament, resultPermissions: { canSubmit: true, canEdit: true }, tournamentMatch: { id: 501, tournamentId: 1, roundNumber: 1 }, mission: { killzone: 'Volkus', critOp: 'Loot', layout: 1 }, table: tables[0] };
const match = { id: 501, tournamentId: 1, roundId: 401, roundNumber: 1, status: 'active', isBye: false, participantAId: 101, participantBId: 102, participantA: participants[0], participantB: participants[1], gameId: 701, table: tables[0], tableId: 11, mission: game.mission };
const rounds = [{ id: 401, roundNumber: 1, status: 'active', updatedAt: '2026-11-11T10:00:00Z', matches: [match] }];
const staff = { ownerUserId: 1, canManageJudges: true, staff: [{ userId: 1, name: 'Journey', role: 'organizer', active: true, canRevoke: false }, { userId: 2, name: 'North', role: 'judge', active: true, assigned: true, canRevoke: true }] };
const standings = [{ rank: 1, participantId: 101, wins: 1, losses: 0, matchPoints: 3, totalVp: 12 }, { rank: 2, participantId: 102, wins: 0, losses: 1, matchPoints: 0, totalVp: 9 }];
const detail = { tournament, participants, rounds, tables, standings, staff, tournamentGames: [{ ...game, status: 'completed', result: { scores: score, winnerId: 1 } }] };
const rosters = [{ id: 201, teamId: 21, name: 'Companion Alpha', captainUserId: 1, status: 'active', seed: 1, paid: true, members: [{ id: 301, slot: 1, userId: 1, displayNameSnapshot: 'Journey', factionSnapshot: 'Tempestus Aquilons' }, { id: 303, slot: 2, userId: 3, displayNameSnapshot: 'Ember', factionSnapshot: 'Kasrkin' }, { id: 304, slot: 3, userId: 4, displayNameSnapshot: 'Vega', factionSnapshot: 'Angels of Death' }] }, { id: 202, teamId: 22, name: 'Northern Watch', captainUserId: 2, status: 'active', seed: 2, paid: false, members: [{ id: 302, slot: 1, userId: 2, displayNameSnapshot: 'North', factionSnapshot: 'Goremongers' }, { id: 305, slot: 2, userId: 5, displayNameSnapshot: 'Nika', factionSnapshot: 'Deathwatch' }, { id: 306, slot: 3, userId: 6, displayNameSnapshot: 'Storm', factionSnapshot: 'Mandrakes' }] }];
const teamTournament = { ...tournament, id: 2, slug: 'companion-teams', name: 'Companion Teams', participantMode: 'team', teamSize: 3, pairingType: 'shield_sword', teamTablesLocked: true };
const teamMatch = { id: 601, tournamentId: 2, roundId: 402, roundNumber: 1, phase: 'shield_selection', pairingType: 'shield_sword', pairingVersion: 2, pairingRevision: 'fixture-pairing-revision', captainPairingEnabled: true, rosterAId: 201, rosterBId: 202, rosterA: rosters[0], rosterB: rosters[1], games: [], tables, missions: [{ critOp: 'Loot' }], missionBans: [], pairingHistory: [], permissions: { canSelectShield: true, side: 'a' } };
const teamGame = { ...game, id: 702, sourceType: 'team_match_game', tournament: teamTournament, teamTournamentGame: { mission: game.mission } };
const teamDetail = { ...detail, tournament: teamTournament, participants: [], rosters, teamMatches: [teamMatch], rounds: [{ ...rounds[0], id: 402, matches: [teamMatch] }], tournamentGames: [teamGame], standings: [{ rank: 1, rosterId: 201, wins: 1, teamTournamentPoints: 3, totalVp: 35 }] };
const pagination = { currentPage: 1, totalPages: 1, total: 2 };
function fixture(path) {
  if (path === '/api/me') return { user, games: [game], teamPairings: [] };
  if (path === '/api/notifications') return { unreadCount: 3, generatedAt: '2026-11-11T10:00:00Z', items: [{ id: 'demo-result', type: 'game_result_pending', title: 'Результат ждёт подтверждения', body: 'Companion Open · первый раунд', createdAt: '2026-11-11T10:00:00Z', unread: true }], lastSeenAt: null };
  if (path === '/api/telegram/status') return { linked: false, link: null };
  if (path === '/api/tournaments' || path === '/api/admin/tournaments') return { tournaments: [tournament, teamTournament], pagination };
  if (path === '/api/admin/tournaments/1' || path === '/api/tournaments/companion-open') return detail;
  if (path === '/api/admin/tournaments/2' || path === '/api/tournaments/companion-teams') return teamDetail;
  if (path.endsWith('/audit')) return { events: [{ id: 1, actorUserId: 1, eventType: 'registration_payment_update', entityType: 'participant', entityId: 101, createdAt: '2026-11-11T10:00:00Z', before: { paid: false }, after: { paid: true } }], pagination };
  if (/\/rounds\/\d+\/pairings$/.test(path)) return { round: rounds[0], revision: 'fixture-revision', participants, tables, lockedMatches: [] };
  if (/\/rounds\/\d+\/tables$/.test(path)) return { round: { id: 402, roundNumber: 1, updatedAt: '2026-11-11T10:00:00Z' }, tables };
  if (path === '/api/games/701') return { game };
  if (path === '/api/games/702') return { game: teamGame };
  if (path === '/api/teams/dashboard') return { teams: [{ id: 21, name: 'Companion Alpha', slug: 'companion-alpha', leaderUserId: 1 }], invitations: [] };
  if (path === '/api/team-matches/601') return { teamMatch, tournament: teamTournament };
  if (path === '/api/rosters/201') return { roster: rosters[0], tournament: teamTournament, standing: teamDetail.standings[0], teamMatches: [teamMatch], viewer: { canRename: true, canEdit: true, canWithdraw: true, canDelete: false } };
  if (path === '/api/auth/email-config') return { enabled: true };
  return undefined;
}
module.exports = { fixture };
