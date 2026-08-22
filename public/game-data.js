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
  "Volkus",
  "Gallowdark",
  "Bheta-Decima",
  "Octarius",
  "Tomb World",
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
    endsAt: null
  }
];

const venueModeOptions = [
  { key: "tts", labelKey: "venue.tts" },
  { key: "irl", labelKey: "venue.irl" }
];

if (typeof module !== "undefined") {
  module.exports = {
    tacOpOptions,
    critOpOptions,
    killzoneOptions,
    gameSystemOptions,
    seasons,
    venueModeOptions
  };
}
