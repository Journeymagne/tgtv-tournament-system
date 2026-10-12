const path = require("node:path");
const { spawnSync } = require("node:child_process");
const serviceRoot = path.join(__dirname, "..", "services", "combat-lab");
let buildScript;
try { buildScript = require.resolve("react-scripts/scripts/build", { paths: [serviceRoot] }); }
catch { console.error("Install Combat Lab dependencies: npm ci --prefix services/combat-lab --include=dev --ignore-scripts"); process.exit(1); }
for (const script of [path.join(serviceRoot, "scripts/copy-rules.js"), buildScript]) {
  const result = spawnSync(process.execPath, [script], {
    cwd: serviceRoot,
    env: { ...process.env, PUBLIC_URL: "/combat", BUILD_PATH: "build-companion" },
    stdio: "inherit"
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}
