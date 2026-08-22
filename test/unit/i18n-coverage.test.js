const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const APP_PATH = path.join(__dirname, "../../public/app.js");
const source = fs.readFileSync(APP_PATH, "utf8");

// Text rendered between tags inside the template literals. Anything with an
// interpolation is skipped: it is either already a t() call or a data value.
const TEXT_NODE = />([^<>{}`$]{3,})</g;

// Text the scanner is allowed to see. Each entry needs a reason -- this list is
// the record of what was reviewed, not a way to silence the test.
const ALLOWED = new Set([
  // Non-breaking spaces and separators used as layout, not copy.
  " - ",
  " / ",
  " vs " // settled decision: kept untranslated in both languages
]);

function isEnglishProse(text) {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  if (!/[a-z]/.test(trimmed)) return false;
  return /^[A-Za-z][A-Za-z0-9 '’,.!?:%()+-]*$/.test(trimmed);
}

test("no untranslated English prose is rendered from app.js", () => {
  const found = new Set();
  for (const match of source.matchAll(TEXT_NODE)) {
    const text = match[1].trim();
    if (ALLOWED.has(match[1])) continue;
    if (!isEnglishProse(text)) continue;
    found.add(text);
  }
  assert.deepEqual(
    [...found].sort(),
    [],
    `These strings are rendered directly instead of through t(): ${[...found].sort().join(" | ")}`
  );
});
