const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const gameData = require("../../public/game-data.js");
const { KILLZONES, CRIT_OPS, KILL_TEAMS } = require("../../src/domain/kill-teams");

// public/app.js is a browser script: it runs top-level bootstrap code
// (applyLocale/applyTheme/boot) against `window`/`document` as soon as it
// loads, so it cannot be `require()`d or `Module._compile`d the way
// test/unit/kill-teams.test.js recompiles src/domain/kill-teams.js. Instead,
// pull just the `killTeamOptions` array literal out of the source text and
// evaluate that literal in isolation -- it is pure string literals, so this
// reads the real array from disk without executing the rest of the file.
function loadKillTeamOptions() {
  const appJsPath = path.join(__dirname, "../../public/app.js");
  const source = fs.readFileSync(appJsPath, "utf8");
  const match = source.match(/const killTeamOptions = (\[[\s\S]*?\]);/);
  assert.ok(match, "could not find `const killTeamOptions = [...]` in public/app.js");
  // eslint-disable-next-line no-new-func -- evaluating an extracted array-of-strings literal, not arbitrary code
  return new Function(`return ${match[1]};`)();
}

test("game-data exposes every reference table", () => {
  assert.deepEqual(Object.keys(gameData).sort(), [
    "critOpOptions",
    "gameSystemOptions",
    "killzoneOptions",
    "seasons",
    "tacOpOptions",
    "venueModeOptions"
  ]);
});

test("tac ops list is complete", () => {
  assert.deepEqual(gameData.tacOpOptions, [
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
  ]);
});

// The client and the domain module each carry their own copy of these two
// lists. Neither can require the other (one is a browser script, one is
// server-side), so this test is what keeps the copies honest.
test("killzones match the domain module", () => {
  assert.deepEqual(gameData.killzoneOptions, KILLZONES);
});

test("crit ops match the domain module", () => {
  assert.deepEqual(gameData.critOpOptions, CRIT_OPS);
});

// public/app.js hand-maintains its own killTeamOptions array (for the game
// filter, statistics filter, and faction dropdowns) rather than requiring
// src/domain/kill-teams.js, which browser scripts cannot do. public/i18n/
// glossary.js derives its protected kill-team names from the src/ copy, so if
// the two arrays drift apart, a kill team name would silently lose glossary
// protection while still being a logo filename.
//
// The two arrays are curated in different orders on purpose (app.js groups
// teams for the dropdown UI; KILL_TEAMS keeps canonical registry order), so
// this compares membership, not array order.
test("kill team dropdown options match the domain module", () => {
  const appOptions = loadKillTeamOptions();
  assert.equal(new Set(appOptions).size, appOptions.length, "killTeamOptions in public/app.js has a duplicate");
  assert.deepEqual(
    [...appOptions].sort(),
    [...KILL_TEAMS].sort(),
    "killTeamOptions in public/app.js and KILL_TEAMS in src/domain/kill-teams.js must contain exactly the same names"
  );
});

test("game systems and seasons carry the protected product names", () => {
  assert.deepEqual(gameData.gameSystemOptions, ["Warhammer 40k Kill Team"]);
  assert.deepEqual(
    gameData.seasons.map((season) => season.name),
    ["2026 Q2 Dataslate"]
  );
});

test("venue modes cover both keys and reference dictionary labels", () => {
  assert.deepEqual(gameData.venueModeOptions, [
    { key: "tts", labelKey: "venue.tts" },
    { key: "irl", labelKey: "venue.irl" }
  ]);
});
