function teamGamePermissions(game, rosterA, rosterB, user) {
  game = game || {};
  const playerIds = game.playerIds || [];
  const userId = user?.id;
  const captainRoster = userId && [rosterA, rosterB].find((roster) => roster?.captainUserId === userId);
  const participant = Boolean(userId && playerIds.includes(userId));
  const ownRoster = captainRoster || [rosterA, rosterB][playerIds.indexOf(userId)];
  const pending = game.pendingResult;
  const submittedRoster = pending?.submittedRosterId || [rosterA, rosterB][playerIds.indexOf(pending?.submittedBy)]?.id;
  const ownSubmission = pending?.submittedBy === userId;
  const sameSide = Boolean(ownRoster && submittedRoster === ownRoster.id);
  const canAct = Boolean(user?.isAdmin || participant || captainRoster);
  const pendingCaptain = pending?.submittedAs === "captain";
  return {
    canView: Boolean(user?.isAdmin || participant || captainRoster || game.status === "completed"),
    canSubmit: canAct && (game.status === "open" || (game.status === "pending_confirmation" && ownSubmission)),
    canReview: game.status === "pending_confirmation" && Boolean(user?.isAdmin || (
      !ownSubmission && !sameSide && (pendingCaptain ? captainRoster : participant || captainRoster)
    )),
    captainRosterId: captainRoster?.id || null,
    ownRosterId: ownRoster?.id || null
  };
}

module.exports = { teamGamePermissions };
