const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { inputFingerprint, isBuildCurrent } = require("./combat-build-state");

const root = path.join(__dirname, "..");
const serviceRoot = path.join(root, "services", "combat-lab");
if (isBuildCurrent(inputFingerprint())) {
  console.log("Combat Lab is unchanged; reusing the /combat build (install and build skipped).");
  process.exit(0);
}
const npmCli = process.env.npm_execpath;
if (!npmCli || !fs.existsSync(npmCli)) {
  console.error("Run this installer through npm: npm run postinstall");
  process.exit(1);
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Preparing the Companion calculator at /combat.");
// The nested package has a separate lockfile. Include build tools even when
// Companion was installed with --omit=dev or NODE_ENV=production.
// Ignore nested lifecycle scripts: this build does not use react-snap.
run(npmCli, ["ci", "--prefix", serviceRoot, "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"]);
run(path.join(__dirname, "build-combat-lab.js"));
