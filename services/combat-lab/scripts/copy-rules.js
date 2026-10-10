// Copies the rules Markdown rendered in-app (rules/<file>) into public/rules/ so
// the running app can fetch them. rules/ stays the single source of truth;
// public/rules/ is generated (gitignored) and refreshed on every start/build via
// the prestart/prebuild(:react) npm hooks.
//
// Only the docs actually surfaced in-app are published — an explicit allowlist so
// internal notes (e.g. rules/README.md) are never accidentally exposed.
const fs = require('fs');
const path = require('path');

const DOCS = ['COMBAT_RULES.md', 'FIGHT_RULES.md', 'WEAPON_RULES.md', 'RETAINED_VS_MODIFIED_DICE.md', 'COVER_SAVES.md',
  'WEAPON_BALANCE.md'];

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'rules');
const outDir = path.join(repoRoot, 'public', 'rules');

if (!fs.existsSync(srcDir)) {
  console.error(`copy-rules: source directory not found: ${srcDir}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// A missing individual doc only breaks that one /rules/* page (a 404 the page
// already renders an error for) — it should not fail npm start/build for
// everyone. Warn and skip rather than exiting, so one bad rename doesn't take
// down the whole dev server or CI build.
let copied = 0;
for (const file of DOCS) {
  const from = path.join(srcDir, file);
  if (!fs.existsSync(from)) {
    console.warn(`copy-rules: expected rules doc not found, skipping: ${from}`);
    continue;
  }
  fs.copyFileSync(from, path.join(outDir, file));
  copied += 1;
}

console.log(`copy-rules: copied ${copied}/${DOCS.length} file(s) to public/rules/`);
