const { canonicalKillTeam } = require("../kill-teams");

const codes = {
  loyal: {
    "Angels of Death": "AoD", Battleclade: "BC", "Celestian Insidiants": "CI", "Death Korps": "DK",
    Deathwatch: "DW", "Elucidian Starstriders": "ES", "Exaction Squad": "EX", "Hunter Clade": "HC",
    "Inquisitorial Agents": "IA", Kasrkin: "KS", "Navy Breachers": "NB", Novitiates: "NV",
    "Phobos Strike Team": "PST", Ratlings: "RT", Sanctifiers: "SA", "Scout Squad": "SC",
    "Spectre Squad": "SP", "Tempestus Aquilons": "TA", "Wolf Scouts": "WS"
  },
  chaos: {
    Blooded: "BL", "Chaos Cult": "CC", "Fellgor Ravagers": "FR", "Gellerpox Infected": "GI",
    Goremongers: "GM", Legionaries: "LG", Murderwing: "MW", "Nemesis Claw": "NC", "Plague Marines": "PM", Warpcoven: "WC"
  },
  xenos: {
    "Blades of Khaine": "BoK", "Brood Brothers": "BB", "Canoptek Circle": "CaC", "Corsair Voidscarred": "CV",
    "Dragon Masters": "DM", "Farstalker Kinband": "FK", "Hand of the Archon": "HoA", "Hearthkyn Salvagers": "HS",
    "Hernkyn Yaegirs": "HY", "Hierotek Circle": "HiC", Kommandos: "KM", Mandrakes: "MD", Pathfinders: "PF",
    Raveners: "RV", "Vespid Stingwings": "VS", "Void-Dancer Troupe": "VDT", "Wrecka Krew": "WK",
    Wyrmblade: "WB", "XV26 Stealth Battlesuits": "XV"
  }
};
const byName = new Map(Object.entries(codes).flatMap(([side, teams]) =>
  Object.entries(teams).map(([name, code]) => [name, { side, code }])));

function leaguePick(value, declared = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const name = canonicalKillTeam(raw) || raw;
  return { name, ...(byName.get(name) || { code: null, side: "unknown" }), declared };
}

function uniquePicks(picks) {
  const unique = new Map();
  for (const pick of picks) {
    if (pick && (!unique.has(pick.name) || !pick.declared)) unique.set(pick.name, pick);
  }
  return [...unique.values()];
}

function playedOrDeclared(played, factions) {
  const actual = uniquePicks(played);
  if (actual.length) return actual;
  const registered = uniquePicks((factions || []).map(value => leaguePick(value, true)));
  return registered.length === 1 ? registered : [];
}

module.exports = { leaguePick, uniquePicks, playedOrDeclared };

