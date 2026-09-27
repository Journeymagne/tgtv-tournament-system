function isPlatformAdmin(user) {
  return Boolean(user?.isSuperAdmin || user?.isAdmin);
}

function canManageTournament(user, tournament) {
  if (!user) return false;
  if (isPlatformAdmin(user)) return true;
  const id = Number(typeof tournament === "object" ? tournament?.id : tournament);
  if (!Number.isSafeInteger(id) || id < 1) return false;
  return Number(tournament?.ownerUserId) === user.id || (user.managedTournamentIds || []).includes(id);
}

function canManageJudges(user, tournament) {
  return Boolean(user && (user.isSuperAdmin || Number(tournament?.ownerUserId) === user.id));
}

function canCreateTournament(user) {
  return Boolean(user && (isPlatformAdmin(user) || user.canCreateTournaments));
}

function canOpenAdministration(user) {
  return Boolean(user && (canCreateTournament(user) || user.managedTournamentIds?.length));
}

function tournamentPermissions(user, tournament) {
  const canAdmin = canManageTournament(user, tournament);
  return {
    canAdmin,
    canManageJudges: canManageJudges(user, tournament),
    role: user?.isSuperAdmin ? "super_admin" : user && tournament?.ownerUserId === user.id ? "organizer"
      : canAdmin ? "judge" : "player"
  };
}

function userCapabilities(user) {
  return {
    canOpenAdministration: canOpenAdministration(user),
    canCreateTournaments: canCreateTournament(user),
    canManageUsers: isPlatformAdmin(user),
    canManageContent: isPlatformAdmin(user),
    canAssignGlobalRoles: Boolean(user?.isSuperAdmin)
  };
}

module.exports = { isPlatformAdmin, canManageTournament, canManageJudges, canCreateTournament,
  canOpenAdministration, tournamentPermissions, userCapabilities };
