const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const root = path.join(__dirname, "..");
const serviceRoot = path.join(root, "services", "combat-lab");
const buildRoot = path.join(serviceRoot, "build-companion");
const stateFile = ".companion-build.json";

function hashFiles(base, entries, ignored = new Set()) {
  const hash = createHash("sha256");
  function visit(relative) {
    if (ignored.has(relative)) return;
    const filename = path.join(base, relative);
    hash.update(JSON.stringify(relative) + "\0");
    let stat;
    try { stat = fs.statSync(filename); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("missing\0");
      return;
    }
    if (stat.isDirectory()) {
      hash.update("directory\0");
      for (const name of fs.readdirSync(filename).sort()) {
        visit(relative ? `${relative}/${name}` : name);
      }
    } else {
      hash.update(`file:${stat.size}\0`);
      hash.update(fs.readFileSync(filename));
    }
  }
  for (const entry of entries) visit(entry);
  return hash.digest("hex");
}

function inputFingerprint() {
  const hash = createHash("sha256");
  hash.update(hashFiles(serviceRoot, [
    "src", "public", "rules", "scripts",
    "tsconfig.json", "jsconfig.json", ".browserslistrc", ".eslintrc",
    ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json", ".eslintignore",
    ".env", ".env.local", ".env.production", ".env.production.local"
  ], new Set(["public/rules", "rules/README.md", "src/react-app-env.d.ts"])));
  // A release-number bump alone does not change the calculator or its deps.
  // Preserve every actual dependency version in the lockfile.
  for (const filename of ["package.json", "package-lock.json"]) {
    const pkg = JSON.parse(fs.readFileSync(path.join(serviceRoot, filename), "utf8"));
    delete pkg.version;
    if (filename === "package-lock.json" && pkg.packages?.[""]) delete pkg.packages[""].version;
    hash.update(filename + "\0" + JSON.stringify(pkg));
  }
  hash.update(hashFiles(root, [
    "scripts/build-combat-lab.js", "scripts/combat-build-state.js"
  ]));
  // Keep the cache valid across unrelated Companion releases, but invalidate it
  // when the build runtime, CRA options or compiled-in React settings change.
  const options = Object.keys(process.env).filter(name =>
    name.startsWith("REACT_APP_") || [
      "GENERATE_SOURCEMAP", "INLINE_RUNTIME_CHUNK", "IMAGE_INLINE_SIZE_LIMIT",
      "DISABLE_NEW_JSX_TRANSFORM", "DISABLE_ESLINT_PLUGIN", "TSC_COMPILE_ON_ERROR",
      "BROWSERSLIST", "BROWSERSLIST_ENV"
    ].includes(name)
  ).sort().map(name => [name, process.env[name]]);
  hash.update(JSON.stringify([process.version, process.platform, process.arch, "/combat", options]));
  return hash.digest("hex");
}

function outputFingerprint() {
  if (!fs.statSync(path.join(buildRoot, "index.html")).isFile()) throw new Error("Missing Combat Lab HTML");
  const manifest = JSON.parse(fs.readFileSync(path.join(buildRoot, "asset-manifest.json"), "utf8"));
  if (!manifest.files || !manifest.entrypoints?.length) throw new Error("Invalid Combat Lab manifest");
  for (const asset of Object.values(manifest.files)) {
    if (typeof asset !== "string" || !asset.startsWith("/combat/")) throw new Error("Invalid Combat Lab asset path");
    const filename = path.resolve(buildRoot, asset.slice("/combat/".length));
    if (!filename.startsWith(buildRoot + path.sep) || !fs.statSync(filename).isFile()) {
      throw new Error("Missing Combat Lab asset");
    }
  }
  return hashFiles(buildRoot, [""], new Set([stateFile]));
}

function isBuildCurrent(inputs) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(buildRoot, stateFile), "utf8"));
    return state.version === 1 && state.inputs === inputs && state.outputs === outputFingerprint();
  } catch {
    return false;
  }
}

function recordBuild(inputs) {
  // Only a successful, complete build gets a reusable stamp. Hash the outputs
  // too, so missing or damaged assets cannot silently reuse a broken build.
  const state = { version: 1, inputs, outputs: outputFingerprint() };
  fs.writeFileSync(path.join(buildRoot, stateFile), JSON.stringify(state, null, 2) + "\n");
}

module.exports = { inputFingerprint, isBuildCurrent, recordBuild };
