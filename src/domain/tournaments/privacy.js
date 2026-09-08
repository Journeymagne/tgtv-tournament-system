function registrationFactionsHidden(tournament) {
  return !tournament || ["draft", "registration_open"].includes(tournament.status);
}

function rosterForViewer(roster, tournament, user, { teamLeader = false } = {}) {
  if (!registrationFactionsHidden(tournament) || user?.isAdmin ||
      (user && (roster.captainUserId === user.id || teamLeader))) return roster;
  return {
    ...roster,
    members: (roster.members || []).map((member) => {
      if (user && member.userId === user.id) return member;
      return { ...member, factionSnapshot: "", factionHidden: true };
    })
  };
}

module.exports = { registrationFactionsHidden, rosterForViewer };
