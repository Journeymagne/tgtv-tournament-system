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
  "venue.irl": "In Real Life",

  // -- auth -----------------------------------------------------------------
  "auth.brand.logoAlt": "TGTV logo",
  "auth.brand.title": "TGTV Ranking Tournament System",
  "auth.brand.tagline": "Kill Team challenges, Approved Ops results, and player ratings in one place.",
  "auth.tab.signIn": "Sign in",
  "auth.tab.register": "Register",
  "auth.tab.admin": "Admin",
  "auth.title.login": "Sign in",
  "auth.title.register": "Create account",
  "auth.title.setup": "First administrator",
  "auth.subtitle.login": "Return to your challenges, matches, and rating.",
  "auth.subtitle.register": "Your name will be visible in player search and the leaderboard.",
  "auth.subtitle.setup": "Create the account that can manage players and ratings.",
  "auth.action.login": "Sign in",
  "auth.action.register": "Create account",
  "auth.action.setup": "Create administrator",
  "auth.field.name": "Name",
  "auth.field.password": "Password",
  "auth.field.confirmPassword": "Confirm password",
  "auth.field.registerNickname": "Register Nickname",
  "auth.field.registerNicknamePlaceholder": "Optional",
  "auth.field.telegramContact": "Telegram Contact",
  "auth.field.telegramContactPlaceholder": "@username",

  // -- play -----------------------------------------------------------------
  "play.newChallenge.title": "New challenge",
  "play.newChallenge.hint": "Find a player by name or contacts and send a challenge.",
  "play.newChallenge.searchPlaceholder": "Player name or contacts",
  "play.newChallenge.searchAction": "Search",
  "play.incoming.title": "Incoming challenges",
  "play.incoming.empty": "No new challenges.",
  "play.outgoing.title": "Sent challenges",
  "play.outgoing.empty": "No pending challenges.",
  "play.active.title": "Active matches",
  "play.active.empty": "No accepted matches yet.",
  "play.recent.title": "Recent results",
  "play.recent.empty": "Completed matches will appear here.",
  "play.search.challengeAction": "Challenge",
  "play.search.empty": "No players found.",
  "play.search.hint": "Start typing a player name or contact.",
  "play.game.waitingForResult": "Waiting for Approved Ops result",
  "play.game.you": "You",
  "play.action.enterResult": "Enter result",
  "play.action.editResult": "Edit result",
  "play.action.reviewResult": "Review result",
  "play.action.deletePending": "Delete pending",
  "play.action.exitGame": "Exit game",
  "play.action.details": "Details",
  "play.search.searching": "Searching for matches..."
};

if (typeof module !== "undefined") module.exports = TGTV_I18N_EN;
