function isPlatformAdmin(user) {
  return Boolean(user?.isSuperAdmin || user?.isAdmin);
}

function tournamentId(tournament) {
  return Number(tournament?.id ?? tournament);
}

function personalOwner(user, tournament) {
  return Boolean(user && tournament?.providerId == null && tournament?.ownerUserId === user.id);
}

function canManageTournament(user, tournament) {
  if (!user) return false;
  const id = tournamentId(tournament);
  return isPlatformAdmin(user) || personalOwner(user, tournament) || Boolean(user.managedTournamentIds?.includes(id));
}

function canManageJudges(user, tournament) {
  if (!user) return false;
  return Boolean(isPlatformAdmin(user) || personalOwner(user, tournament)
    || user.judgeManagementTournamentIds?.includes(tournamentId(tournament)));
}

function canFinishTournament(user, tournament) {
  return Boolean(user && (isPlatformAdmin(user) || personalOwner(user, tournament)
    || user.organizedTournamentIds?.includes(tournamentId(tournament))));
}

function canCreateTournament(user, {providerId = null} = {}) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  if (providerId == null) return Boolean(user.canCreateTournaments);
  return Boolean(user.providerMemberships?.some(member => member.providerId === providerId
    && member.role === 'organizer' && !member.archivedAt));
}

function canCreateProviderEvents(user) {
  return Boolean(user?.providerMemberships?.some(member => member.role === 'organizer' && !member.archivedAt));
}

function canOpenAdministration(user) {
  return Boolean(user && (canCreateTournament(user) || canCreateProviderEvents(user) || user.managedTournamentIds?.length));
}

function tournamentPermissions(user, tournament) {
  const canAdmin = canManageTournament(user, tournament);
  const organizer = personalOwner(user,tournament) || user?.organizedTournamentIds?.includes(tournamentId(tournament));
  return {
    canAdmin,
    canFinish: canFinishTournament(user, tournament),
    canManageJudges: canManageJudges(user, tournament),
    role: user?.isSuperAdmin ? "super_admin" : organizer ? "organizer" : canAdmin ? "judge" : "player"
  };
}

function userCapabilities(user) {
  return {
    canOpenAdministration: canOpenAdministration(user),
    canModerateFAQ: Boolean(user && (isPlatformAdmin(user) || user.isFAQModerator)),
    canCreateTournaments: canCreateTournament(user),
    canCreateProviders: canCreateTournament(user),
    canCreateProviderEvents: canCreateProviderEvents(user),
    canManageUsers: isPlatformAdmin(user),
    canManageContent: isPlatformAdmin(user),
    canAssignGlobalRoles: isPlatformAdmin(user),
    canRevokeAdministrators: Boolean(user?.isSuperAdmin)
  };
}

module.exports = { isPlatformAdmin, canManageTournament, canManageJudges, canFinishTournament, canCreateTournament,
  canOpenAdministration, tournamentPermissions, userCapabilities };
