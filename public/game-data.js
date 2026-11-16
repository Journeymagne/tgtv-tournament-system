// Game reference data shared by the browser app and the Node test suite.
// These are values, not interface copy: they are rendered as <option> text
// *and* stored in the database, so translating them would break already
// recorded games. `public/i18n/glossary.js` reads this file to build the
// protected-term list.

const tacOpOptions = [
  "Plant Devices",
  "Steal Intelligence",
  "Track Enemy",
  "Flank",
  "Retrieval",
  "Scout Enemy Movement",
  "Plant Banner",
  "Martyrs",
  "Envoy",
  "Rout",
  "Sweep & Clear",
  "Dominate"
];

const critOpOptions = [
  "Secure",
  "Loot",
  "Transmission",
  "Orb",
  "Stake Claim",
  "Energy Cells",
  "Download",
  "Data",
  "Reboot"
];

const killzoneOptions = [
  "Volkus 2024",
  "Volkus 2025",
  "Gallowdark",
  "Tomb World",
  "Bheta-Decima 2025",
  "Non-Specific Killzone",
  "Octarius 2025",
  "WTC Open 2025",
  "WTC ITD 2026",
  "Squad-Games Gallowdark+",
  "Volkus",
  "Bheta-Decima",
  "Octarius",
  "WTC ITD",
  "WTC Open",
  "Non-specific"
];

const gameSystemOptions = ["Warhammer 40k Kill Team"];

const seasons = [
  {
    id: "2026-q2-dataslate",
    name: "2026 Q2 Dataslate",
    startsAt: null,
    endsAt: "2026-09-26T00:00:00+04:00"
  },
  {
    id: "2026-q3-dataslate",
    name: "2026 Q3 Dataslate",
    startsAt: "2026-09-26T00:00:00+04:00",
    endsAt: "2026-11-09T00:00:00+04:00"
  },
  {
    id: "2026-q4-dataslate",
    name: "2026 Q4",
    startsAt: "2026-11-09T00:00:00+04:00",
    endsAt: null
  }
];

function currentSeason(at = Date.now(), available = seasons) {
  const time = new Date(at).getTime();
  const startsAt = season => season.startsAt ? Date.parse(season.startsAt) : Number.NEGATIVE_INFINITY;
  const ordered = [...available].sort((a, b) => startsAt(b) - startsAt(a));
  return ordered.find(season => time >= startsAt(season) && (!season.endsAt || time < Date.parse(season.endsAt))) ||
    ordered.find(season => time >= startsAt(season)) || ordered.at(-1);
}

// Q4 introduces result-date membership for all game sources. Earlier events
// retain their historical season assignment, including late submitted results.
function gameInSeason(game, season) {
  if (!season) return true;
  const timestamp = game.submittedAt || game.result?.confirmedAt || game.createdAt || "";
  const time = timestamp ? Date.parse(timestamp) : NaN;
  const cutover = Date.parse("2026-11-09T00:00:00+04:00");
  if (!(time >= cutover) && ["tournament_match", "team_match_game"].includes(game.sourceType) && game.tournament?.seasonId) {
    return game.tournament.seasonId === season.id;
  }
  if (!Number.isFinite(time)) return true;
  return (!season.startsAt || time >= Date.parse(season.startsAt)) &&
    (!season.endsAt || time < Date.parse(season.endsAt));
}

const FACTION_RANKING_MIN_GAMES = 10;

// Lower endpoint of the two-sided 95% Wilson interval, on a 0–100 scale.
// Keep precision for ordering/qualification and round only when displaying.
function wilsonScore(wins, games) {
  if (!Number.isSafeInteger(games) || games <= 0 || !Number.isSafeInteger(wins) || wins < 0 || wins > games) return 0;
  const z = 1.96, z2 = z * z, p = wins / games;
  return Math.max(0, 100 * (p + z2 / (2 * games) -
    z * Math.sqrt(p * (1 - p) / games + z2 / (4 * games * games))) / (1 + z2 / games));
}

const venueModeOptions = [
  { key: "tts", labelKey: "venue.tts" },
  { key: "irl", labelKey: "venue.irl" }
];

if (typeof module !== "undefined") {
  module.exports = {
    FACTION_RANKING_MIN_GAMES,
    tacOpOptions,
    critOpOptions,
    killzoneOptions,
    gameSystemOptions,
    seasons,
    currentSeason,
    gameInSeason,
    wilsonScore,
    venueModeOptions
  };
}
