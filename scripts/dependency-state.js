const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const stampName = ".companion-dependencies.json";
const hash = value => createHash("sha256").update(value).digest("hex");
const readJson = filename => JSON.parse(fs.readFileSync(filename, "utf8"));

function npmVersion() {
  const match = (process.env.npm_config_user_agent || "").match(/\bnpm\/([^ ]+)/);
  if (match) return match[1];
  if (process.env.npm_execpath) {
    return readJson(path.resolve(path.dirname(process.env.npm_execpath), "../package.json")).version;
  }
  throw new Error("Cannot identify npm; run dependency preparation through npm.");
}

function dependencyFingerprint(directory, includeDev, version = npmVersion()) {
  const inputs = [process.version, process.platform, process.arch, version, includeDev];
  for (const name of ["package.json", "package-lock.json"]) {
    const pkg = readJson(path.join(directory, name));
    delete pkg.version;
    if (name === "package-lock.json" && pkg.packages?.[""]) delete pkg.packages[""].version;
    inputs.push(pkg);
  }
  // Hash configuration, never print its contents (registry settings can contain credentials).
  for (const filename of new Set([
    path.join(directory, ".npmrc"), path.join(__dirname, "..", ".npmrc"),
    process.env.npm_config_userconfig || path.join(require("node:os").homedir(), ".npmrc")
  ])) {
    inputs.push(fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : null);
  }
  inputs.push(["npm_config_legacy_peer_deps", "npm_config_strict_peer_deps", "npm_config_install_links",
    "npm_config_registry"].map(key => [key, process.env[key] || ""]));
  return hash(JSON.stringify(inputs));
}

function dependenciesCurrent(directory, inputs) {
  try {
    const modules = path.join(directory, "node_modules");
    if (fs.lstatSync(modules).isSymbolicLink()) return false;
    const stamp = readJson(path.join(modules, stampName));
    if (stamp.version !== 1 || stamp.inputs !== inputs || !stamp.packages) return false;
    if (stamp.lock !== hash(fs.readFileSync(path.join(modules, ".package-lock.json")))) return false;
    for (const [name, version] of Object.entries(stamp.packages)) {
      if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) return false;
      if (readJson(path.join(modules, name, "package.json")).version !== version) return false;
    }
    return true;
  } catch { return false; }
}

function recordDependencies(directory, inputs, includeDev) {
  const pkg = readJson(path.join(directory, "package.json"));
  const modules = path.join(directory, "node_modules");
  const names = Object.keys({ ...pkg.dependencies, ...(includeDev ? pkg.devDependencies : {}) });
  const packages = Object.fromEntries(names.map(name => [name, readJson(path.join(modules, name, "package.json")).version]));
  const stamp = { version: 1, inputs, packages, lock: hash(fs.readFileSync(path.join(modules, ".package-lock.json"))) };
  fs.writeFileSync(path.join(modules, stampName), JSON.stringify(stamp, null, 2) + "\n");
}

module.exports = { dependencyFingerprint, dependenciesCurrent, recordDependencies };
