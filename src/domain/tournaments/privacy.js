function tournamentFactionsHidden(rounds = []) {
  // Closing registration and starting the tournament do not start its first round.
  return !rounds.some((round) => round.roundNumber === 1 && ["active", "completed"].includes(round.status));
}

function rosterForViewer(roster, user, { teamLeader = false, rounds = [] } = {}) {
  const isRosterMember = user && (roster.members || []).some((member) => member.userId === user.id && !member.endedAt);
  if (!tournamentFactionsHidden(rounds) || user?.isAdmin ||
      (user && (roster.captainUserId === user.id || teamLeader || isRosterMember))) return roster;
  return {
    ...roster,
    members: (roster.members || []).map((member) => {
      if (user && member.userId === user.id) return member;
      return { ...member, factionSnapshot: "", factionHidden: true };
    })
  };
}

module.exports = { tournamentFactionsHidden, rosterForViewer };
