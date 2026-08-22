const test = require("node:test");
const assert = require("node:assert/strict");

const gameData = require("../../public/game-data.js");
const { KILLZONES, CRIT_OPS } = require("../../src/domain/kill-teams");

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

test("game systems and seasons carry the protected product names", () => {
  assert.deepEqual(gameData.gameSystemOptions, ["Warhammer 40k Kill Team"]);
  assert.deepEqual(
    gameData.seasons.map((season) => season.name),
    ["2026 Q2 Dataslate"]
  );
});

test("venue modes cover both keys", () => {
  assert.deepEqual(gameData.venueModeOptions.map((item) => item.key), ["tts", "irl"]);
});
