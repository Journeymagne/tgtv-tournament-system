const { ValidationError } = require("../http/io");

const CLASSIFIED_TRACK = [
  "Kasrkin",
  "Inquisitorial Agents",
  "Exaction Squad",
  "Angels of Death",
  "Chaos Cult",
  "Fellgor Ravagers",
  "Hand of the Archon",
  "Farstalker Kinband",
  "Hearthkyn Salvagers",
  "Hierotek Circle",
  "Scout Squad",
  "Blades of Khaine",
  "Plague Marines",
  "Mandrakes",
  "Nemesis Claw",
  "Brood Brothers",
  "Hernkyn Yaegirs",
  "Tempestus Aquilons",
  "Wrecka Krew",
  "Vespid Stingwings",
  "Ratlings",
  "Sanctifiers",
  "Goremongers",
  "Raveners",
  "Battleclade",
  "Deathwatch",
  "Canoptek Circle",
  "Wolf Scouts",
  "Celestian Insidiants",
  "Murderwing",
  "Spectre Squad",
  "Dragon Masters"
];

const EXTRA_TRACK_TEAMS = [
  "Novitiates",
  "Elucidian Starstriders",
  "Hunter Clade",
  "Death Korps",
  "Phobos Strike Team",
  "Gellerpox Infected",
  "Legionaries",
  "Blooded",
  "Warpcoven",
  "Corsair Voidscarred",
  "Wyrmblade",
  "Void-Dancer Troupe",
  "Kommandos",
  "Pathfinders"
];

const ALL_KILL_TEAM_TRACK = [...EXTRA_TRACK_TEAMS, ...CLASSIFIED_TRACK];

const WILDCARDS = ["Navy Breachers", "XV26 Stealth Battlesuits"];

// KILL_TEAMS is derived from ALL_KILL_TEAM_TRACK and WILDCARDS, so "tracks +
// wildcards cover the registry exactly" holds by construction, not by a
// separately maintained list. Do not replace this with an independent
// KILL_TEAMS array — that reintroduces the two-vocabulary split (D3) this
// module exists to eliminate.
const KILL_TEAMS = [...ALL_KILL_TEAM_TRACK, ...WILDCARDS];

const KILLZONES = [
  "Volkus",
  "Gallowdark",
  "Bheta-Decima",
  "Octarius",
  "Tomb World",
  "WTC ITD",
  "WTC Open",
  "Non-specific"
];

const CRIT_OPS = [
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

// Написания, встречавшиеся во вводе и в сохранённых данных до канонизации.
const ALIASES = {
  "angel of death": "Angels of Death",
  "brood brother": "Brood Brothers",
  "celestian insidiant": "Celestian Insidiants",
  "dragon master": "Dragon Masters",
  "elucidian starstrider": "Elucidian Starstriders",
  "fellgor ravager": "Fellgor Ravagers",
  goremonger: "Goremongers",
  "hearthkyn salvager": "Hearthkyn Salvagers",
  "hernkyn yaegir": "Hernkyn Yaegirs",
  "imperial navy breacher": "Navy Breachers",
  "imperial navy breachers": "Navy Breachers",
  "inquisitorial agent": "Inquisitorial Agents",
  legionary: "Legionaries",
  "navy breacher": "Navy Breachers",
  "tempestus aquillons": "Tempestus Aquilons",
  "tempestus aquillon": "Tempestus Aquilons",
  "warp coven": "Warpcoven",
  "stealth suit": "XV26 Stealth Battlesuits",
  "stealth suits": "XV26 Stealth Battlesuits",
  "stealth battlesuit": "XV26 Stealth Battlesuits",
  "stealth battlesuits": "XV26 Stealth Battlesuits",
  "xv 26 stealth suit": "XV26 Stealth Battlesuits",
  "xv 26 stealth suits": "XV26 Stealth Battlesuits",
  "xv 26 stealth battlesuit": "XV26 Stealth Battlesuits",
  "xv 26 stealth battlesuits": "XV26 Stealth Battlesuits",
  "xv26 stealth suit": "XV26 Stealth Battlesuits",
  "xv26 stealth suits": "XV26 Stealth Battlesuits",
  "xv26 stealth battlesuit": "XV26 Stealth Battlesuits"
};

// Имена, которые могли попасть в сохранённые данные под старым словарём.
// Используется миграцией 002.
const LEGACY_NAMES = {
  "Tempestus Aquillons": "Tempestus Aquilons",
  "XV26 Stealth Suits": "XV26 Stealth Battlesuits"
};

function teamKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[`']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BY_KEY = new Map();
for (const team of KILL_TEAMS) {
  BY_KEY.set(teamKey(team), team);
}
for (const [alias, team] of Object.entries(ALIASES)) {
  BY_KEY.set(teamKey(alias), team);
}

function canonicalKillTeam(value) {
  const key = teamKey(value);
  if (!key) return null;
  return BY_KEY.get(key) || null;
}

function requireKillTeam(value) {
  const team = canonicalKillTeam(value);
  if (!team) throw new ValidationError("Choose a valid Kill Team from the list");
  return team;
}

// HIGH 1: restores the pre-refactor tolerance (server.js's
// resultKillTeamInput returned "" for blank input instead of throwing). A
// game result's faction may be left blank -- a legacy pending_result stored
// before validation existed can have an empty faction, and re-validating it
// on confirm must not make it permanently unconfirmable -- but a non-empty
// value still has to resolve to a real Kill Team.
function optionalKillTeam(value) {
  if (!String(value || "").trim()) return "";
  return requireKillTeam(value);
}

module.exports = {
  KILL_TEAMS,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS,
  KILLZONES,
  CRIT_OPS,
  LEGACY_NAMES,
  teamKey,
  canonicalKillTeam,
  requireKillTeam,
  optionalKillTeam
};
