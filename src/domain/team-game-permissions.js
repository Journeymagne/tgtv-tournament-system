function teamGamePermissions(game, rosterA, rosterB, user) {
  game = game || {};
  const playerIds = game.playerIds || [];
  const userId = user?.id;
  const captainRoster = userId && [rosterA, rosterB].find((roster) => roster?.captainUserId === userId);
  const participant = Boolean(userId && playerIds.includes(userId));
  const ownRoster = [rosterA, rosterB][playerIds.indexOf(userId)] || captainRoster;
  const pending = game.pendingResult;
  const submitterCaptain = pending?.submittedBy && [rosterA, rosterB].find((roster) => roster?.captainUserId === pending.submittedBy);
  const submittedRoster = [rosterA, rosterB][playerIds.indexOf(pending?.submittedBy)]?.id || pending?.submittedRosterId || submitterCaptain?.id;
  const ownSubmission = pending?.submittedBy === userId;
  const sameSide = Boolean(ownRoster && submittedRoster === ownRoster.id);
  const canAct = Boolean(user?.isAdmin || participant || captainRoster);
  // Older results marked a playing captain's own game as a captain submission.
  // Match participation determines the role, so those pending results work too.
  const pendingCaptain = !playerIds.includes(pending?.submittedBy) && Boolean(pending?.submittedAs === "captain" || submitterCaptain);
  return {
    canView: Boolean(user?.isAdmin || participant || captainRoster || game.status === "completed"),
    canSubmit: canAct && (game.status === "open" || (game.status === "pending_confirmation" && ownSubmission)),
    canReview: game.status === "pending_confirmation" && Boolean(user?.isAdmin || (
      !ownSubmission && !sameSide && (captainRoster || (!pendingCaptain && participant))
    )),
    submitsAsCaptain: Boolean(captainRoster && !participant),
    requiresCaptainReview: pendingCaptain,
    captainRosterId: captainRoster?.id || null,
    ownRosterId: ownRoster?.id || null
  };
}

module.exports = { teamGamePermissions };
