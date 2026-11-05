const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { guides, key } = require("../../public/pairing-instructions");

test("instructions follow format, manual mode and retained rules version", () => {
  assert.equal(key({ pairingType: "doubles", captainPairingEnabled: false }), "doubles");
  assert.equal(key({ pairingType: "sword_shield_classic", captainPairingEnabled: false }), "manual");
  assert.equal(key({ pairingType: "sword_shield_classic", pairingVersion: 2 }), "classic");
  assert.equal(key({ pairingVersion: 2 }), "wtc");
  assert.equal(key({ pairingVersion: 1 }, { venueMode: "tts" }), "legacyTts");
  assert.equal(key({ pairingVersion: 1 }, { venueMode: "irl" }), "legacyIrl");
});

test("documentation duplicates every instruction in both languages", () => {
  for (const locale of ["ru", "en"]) {
    const source = fs.readFileSync(path.join(__dirname, `../../docs/documentation/${locale}/pairing-instructions.md`), "utf8");
    for (const guide of Object.values(guides[locale])) {
      assert.ok(source.includes(`## ${guide.title}`));
      for (const step of guide.steps) assert.ok(source.includes(step));
    }
  }
});
