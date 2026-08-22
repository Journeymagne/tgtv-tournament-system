// English is the reference dictionary: every key must exist here, and the
// glossary tests compare Russian values against these.
// Keys are flat and dotted, grouped by screen with comment separators.

const TGTV_I18N_EN = {
  // -- common ---------------------------------------------------------------
  "common.langToggle": "Switch to Russian",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.loading": "Loading...",
  "common.empty": "Nothing here yet.",
  "common.yes": "Yes",
  "common.no": "No",

  // -- nav ------------------------------------------------------------------
  "nav.leaderboard": "Leaderboard",
  "nav.matchmaking": "Matchmaking",
  "nav.games": "Games",
  "nav.tournaments": "Tournaments",
  "nav.stats": "Stats",
  "nav.profile": "Profile",
  "nav.challenge": "All Kill Team Challenge",
  "nav.feedback": "Feedback",
  "nav.signOut": "Sign out",
  "nav.openNavigation": "Open navigation",
  "nav.closeNavigation": "Close navigation",
  "nav.openProfile": "Open profile",

  // -- tiebreakers ----------------------------------------------------------
  "tiebreaker.strengthOfSchedule.label": "Strength of Schedule",
  "tiebreaker.strengthOfSchedule.description":
    "Sum of the Tournament Points earned by every opponent the player faced.",
  "tiebreaker.buchholz.label": "Buchholz",
  "tiebreaker.buchholz.description":
    "Sum of opponents' Tournament Points after excluding the highest and lowest opponent totals. It is 0 until the player has faced at least three opponents.",
  "tiebreaker.headToHead.label": "Head-to-head",
  "tiebreaker.headToHead.description":
    "If the tied players faced each other, the winner of their direct match ranks higher. A draw or no direct match does not break the tie.",
  "tiebreaker.totalVp.label": "Total VP",
  "tiebreaker.totalVp.description":
    "Total Victory Points scored by the player across all completed tournament matches.",
  "tiebreaker.vpDiff.label": "VP Diff",
  "tiebreaker.vpDiff.description":
    "The player's total VP minus their opponents' total VP across all completed tournament matches.",

  // -- ops ------------------------------------------------------------------
  "op.crit": "Crit Op",
  "op.kill": "Kill Op",
  "op.tac": "Tac Op",

  // -- venue ----------------------------------------------------------------
  "venue.tts": "Tabletop Simulator",
  "venue.irl": "In Real Life"
};

if (typeof module !== "undefined") module.exports = TGTV_I18N_EN;
