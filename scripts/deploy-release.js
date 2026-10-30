// Linux/PM2 release deployment. Invoke through update_tgtv-ts.sh (holds flock).
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { parseEnv } = require("node:util");
const http = require("node:http");
const root = path.resolve(__dirname, "..");
let interrupted = false;
let child;

function run(command, args, options = {}) {
  if (interrupted) return Promise.reject(new Error("Deployment interrupted"));
  return new Promise((resolve, reject) => {
    let output = "";
    const proc = spawn(command, args, {
      cwd: root, stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit", ...options
    });
    child = proc;
    if (options.capture) proc.stdout.on("data", chunk => { output += chunk; });
    // Captured PM2 output can contain secrets. Never include it in exceptions.
    if (options.capture) proc.stderr.resume();
    proc.on("error", reject);
    proc.on("close", code => {
      if (child === proc) child = null;
      if (code !== 0 || interrupted) reject(new Error(`${command} failed (${code ?? "signal"})`));
      else resolve(output.trim());
    });
  });
}

function exists(filename) {
  try { fs.lstatSync(filename); return true; } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function inside(parent, filename) {
  const relative = path.relative(parent, filename);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function migrationFingerprint(directory) {
  const hash = createHash("sha256");
  function visit(relative) {
    const filename = path.join(directory, relative);
    hash.update(relative + "\0");
    if (fs.statSync(filename).isDirectory()) {
      for (const entry of fs.readdirSync(filename).sort()) visit(`${relative}/${entry}`);
    } else hash.update(fs.readFileSync(filename));
  }
  visit("src/db/migrate.js");
  visit("src/db/migrations");
  return hash.digest("hex");
}

function runtimeEnv(filename, releaseId) {
  // File values win over an old shell/PM2 environment. Do not log this object.
  return { ...process.env, ...parseEnv(fs.readFileSync(filename, "utf8")),
    NODE_ENV: "production", TGTV_RELEASE_ID: releaseId };
}

function healthOrigin(env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT in deployment environment");
  let host = env.HOST || "127.0.0.1";
  if (host === "0.0.0.0") host = "127.0.0.1";
  if (host === "::") host = "::1";
  if (host.includes(":")) host = `[${host}]`;
  return new URL(`http://${host}:${port}`).origin;
}

function healthHeaders(env) {
  // Reach the local listener directly while honoring production's canonical-host redirects.
  return env.COMPANION_ORIGIN ? { Host: new URL(env.COMPANION_ORIGIN).host } : {};
}

function requestPage(url, headers, timeout) {
  return new Promise((resolve, reject) => {
    // http.get preserves an explicit Host header; fetch can replace it with the URL host.
    const request = http.get(url, { headers, signal: AbortSignal.timeout(timeout) }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
        if (body.length > 4 * 1024 * 1024) request.destroy(new Error("Unexpectedly large health response"));
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on("error", reject);
  });
}

async function ready(origin, releaseId, { timeout = 60000, headers = {} } = {}) {
  const deadline = Date.now() + timeout;
  do {
    if (interrupted) throw new Error("Deployment interrupted");
    try {
      for (const route of ["/", "/api/me", "/combat", "/combat/api/health"]) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("Readiness deadline reached");
        const response = await requestPage(origin + route, headers, Math.min(3000, remaining));
        if (response.status !== 200 || (releaseId && response.headers["x-kt-release"] !== releaseId)) {
          throw new Error("Unexpected release or response status");
        }
        if (route.includes("/api/")) {
          const json = JSON.parse(response.body);
          if (route === "/combat/api/health" && (json.status !== "ok" || json.buildReady !== true)) {
            throw new Error("Calculator unavailable");
          }
          if (route === "/api/me" && (!json || !Object.hasOwn(json, "user"))) throw new Error("Invalid API response");
        } else if (!/<html[\s>]/i.test(response.body)) throw new Error("Invalid HTML response");
      }
      return;
    } catch { /* Startup includes database migrations; allow bounded retries. */ }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(1000, deadline - Date.now()))));
  } while (Date.now() < deadline);
  throw new Error(`Release did not become healthy within ${timeout / 1000} seconds; inspect PM2 logs`);
}

async function preflight() {
  // Import modules and validate configuration/build WITHOUT start(), SQL or email delivery.
  const config = require("../src/config");
  config.requireDatabaseUrl();
  require("../src/email/config").configuration();
  require("../server");
  healthOrigin(process.env);
  const build = require("./combat-build-state");
  if (!build.isBuildCurrent(build.inputFingerprint())) throw new Error("Combat Lab build is missing or stale");
  for (const file of ["home.html", "index.html"]) {
    if (!fs.existsSync(path.join(root, "public", file))) throw new Error(`Missing Companion page: ${file}`);
  }
  console.log("Preflight passed: server imports, configuration, pages and Combat Lab build; database untouched.");
}

async function deploy([repo, app, name, envFile, mode]) {
  if (process.platform !== "linux") throw new Error("Release deployment requires Linux; use the Bash wrapper on the server");
  if (!repo || !app || !name || !envFile || (mode && mode !== "--prepare-only")) throw new Error("Invalid deployment arguments");
  if (![repo, app, envFile].every(path.isAbsolute) || !/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Use absolute paths and a valid PM2 name");
  repo = fs.realpathSync(repo);
  app = path.resolve(app);
  if (process.env.TGTV_DEPLOY_LOCKED !== app) throw new Error("Use update_tgtv-ts.sh so the deployment lock is held");
  if (app === path.parse(app).root || repo === app || inside(app, repo) || inside(repo, app)) throw new Error("Repository and app directories must be separate");
  const releases = `${app}-releases`;
  const shared = `${app}-shared`;
  const cache = `${app}-cache`;
  const id = new Date().toISOString().replace(/[-:.]/g, "") + "-" + await run("git", ["rev-parse", "--short=12", "HEAD"], { cwd: repo, capture: true });
  const candidate = path.join(releases, id);
  const manifest = { id, phase: "preparing", previous: null, migrationRollbackSafe: false };
  const saveState = phase => {
    manifest.phase = phase;
    const temporary = path.join(candidate, ".release.json.tmp");
    fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, path.join(candidate, ".release.json"));
  };
  let previous = null;
  let legacy = false;
  if (exists(app)) {
    if (fs.lstatSync(app).isSymbolicLink()) {
      previous = fs.realpathSync(app);
      if (!inside(releases, previous)) throw new Error("Current app link is outside the managed releases directory");
    } else {
      if (!fs.statSync(app).isDirectory()) throw new Error("App path is not a directory");
      previous = app;
      legacy = true;
    }
  }
  const env = runtimeEnv(envFile, id);
  healthOrigin(env);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL must be configured before deployment");
  const getProcess = async () => {
    const list = JSON.parse(await run("pm2", ["jlist"], { capture: true }));
    const matches = list.filter(item => item.name === name);
    if (matches.length > 1) throw new Error("This deployer supports a single PM2 fork process only");
    return matches[0];
  };
  const oldProcess = await getProcess();
  if (oldProcess) {
    if (!previous || oldProcess.pm2_env.exec_mode !== "fork_mode" ||
        fs.realpathSync(oldProcess.pm2_env.pm_exec_path) !== fs.realpathSync(path.join(previous, "server.js"))) {
      throw new Error("PM2 target does not match the current app/server.js fork process");
    }
    if (oldProcess.pm2_env.status !== "online") throw new Error("Existing PM2 process must be online before deployment");
  }
  const previousFileEnv = previous && exists(path.join(previous, ".env")) ?
    parseEnv(fs.readFileSync(path.join(previous, ".env"), "utf8")) : null;
  const previousEnv = previous && (oldProcess || previousFileEnv) ? {
    ...process.env, ...previousFileEnv, ...oldProcess?.pm2_env.env,
    TGTV_RELEASE_ID: oldProcess?.pm2_env.env?.TGTV_RELEASE_ID || ""
  } : null;
  if (previous && !previousEnv) throw new Error("Previous release has no recoverable environment");
  if (await run("git", ["status", "--porcelain"], { cwd: repo, capture: true })) throw new Error("Commit or remove working-tree changes before deployment");
  for (const directory of [releases, shared, cache]) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const sharedWork = path.join(shared, "work");
  const previousWork = previous && path.join(previous, "work");
  for (const directory of [previousWork, sharedWork]) {
    if (directory && exists(directory) && !fs.statSync(directory).isDirectory()) {
      throw new Error("Existing work storage must be a directory");
    }
  }
  const workLinkTarget = previousWork && exists(previousWork) && fs.lstatSync(previousWork).isSymbolicLink() ?
    fs.realpathSync(previousWork) : null;
  if (workLinkTarget && (workLinkTarget === previous || inside(previous, workLinkTarget))) {
    throw new Error("The work symlink must resolve outside the release directory");
  }
  if (workLinkTarget && exists(sharedWork) && fs.realpathSync(sharedWork) !== workLinkTarget) {
    throw new Error("Current work link and shared/work have different targets; reconcile them before deploying");
  }
  if (previous && exists(path.join(previous, "work")) && !fs.lstatSync(path.join(previous, "work")).isSymbolicLink() && exists(sharedWork)) {
    throw new Error("Both legacy work and shared/work exist; reconcile them before deploying");
  }
  fs.mkdirSync(candidate);
  saveState("preparing");
  const archive = path.join(candidate, ".source.tar");
  await run("git", ["archive", "--format=tar", `--output=${archive}`, "HEAD"], { cwd: repo });
  await run("tar", ["-xf", archive, "-C", candidate]);
  fs.unlinkSync(archive);
  fs.writeFileSync(path.join(candidate, ".env"), fs.readFileSync(envFile), { mode: 0o600 });
  const calculatorBuild = path.join("services", "combat-lab", "build-companion");
  if (previous && exists(path.join(previous, calculatorBuild))) {
    fs.cpSync(path.join(previous, calculatorBuild), path.join(candidate, calculatorBuild), { recursive: true, verbatimSymlinks: true });
  }
  console.log(`Preparing ${candidate}; the current process remains running.`);
  await run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: candidate, env });
  await run("npm", ["run", "postinstall"], { cwd: candidate, env: { ...env, TGTV_COMBAT_CACHE_DIR: cache } });
  await run(process.execPath, [path.join(candidate, "scripts", "deploy-release.js"), "--preflight"], { cwd: candidate, env });
  try { manifest.migrationRollbackSafe = Boolean(previous && migrationFingerprint(previous) === migrationFingerprint(candidate)); } catch { /* unsafe */ }
  manifest.previous = previous;
  saveState("prepared");
  if (mode === "--prepare-only") {
    console.log(`Prepared ${candidate}. No PM2 changes, database migrations or application switch performed.`);
    return;
  }
  if (interrupted) throw new Error("Deployment interrupted");
  const serviceRuntime = require('./service-runtime');
  const currentMode = serviceRuntime.readState(app)?.mode || 'monolith';
  const runtimeMode = process.env.TGTV_RUNTIME_MODE || currentMode;
  if (!['services', 'monolith'].includes(runtimeMode)) throw new Error('Invalid runtime mode');
  if (runtimeMode === 'services' || currentMode === 'services') {
    saveState('switching');
    await serviceRuntime.switchRelease({ app, name, candidate, id, mode: runtimeMode,
      migrationRollbackSafe: manifest.migrationRollbackSafe });
    saveState('healthy');
    return;
  }
  console.log(manifest.migrationRollbackSafe ? "Migrations unchanged: automatic code rollback enabled." :
    "Migration compatibility is unverified: no automatic code rollback after the new server starts.");
  let touchedProcess = false;
  let candidateStarted = false;
  let healthy = false;
  let linkSequence = 0;
  const setCurrent = directory => {
    // A failure before the initial directory rename leaves the legacy path intact.
    if (directory === app && exists(app) && !fs.lstatSync(app).isSymbolicLink()) return;
    const temporary = `${app}.next-${id}-${linkSequence++}`;
    fs.symlinkSync(directory, temporary, "dir");
    fs.renameSync(temporary, app);
  };
  const removeProcess = async () => {
    if (await getProcess()) await run("pm2", ["delete", name]);
  };
  const startProcess = async (directory, values) => {
    await run("pm2", ["start", path.join(directory, "server.js"), "--name", name, "--cwd", directory,
      "--interpreter", process.execPath, "--kill-timeout", "10000", "--time",
      "--output", path.join(sharedWork, `${name}.out.log`), "--error", path.join(sharedWork, `${name}.err.log`)], { env: values });
  };
  try {
    saveState("switching");
    touchedProcess = true;
    await removeProcess();
    if (legacy) {
      const legacyPath = path.join(releases, `legacy-${id}`);
      fs.renameSync(app, legacyPath);
      previous = legacyPath;
      manifest.previous = previous;
    }
    const oldWork = previous && path.join(previous, "work");
    if (oldWork && exists(oldWork) && !fs.lstatSync(oldWork).isSymbolicLink()) {
      fs.renameSync(oldWork, sharedWork);
      fs.symlinkSync(sharedWork, oldWork, "dir");
    } else if (workLinkTarget) {
      if (!exists(sharedWork)) fs.symlinkSync(workLinkTarget, sharedWork, "dir");
      // A relative legacy link can break when its parent moves into releases/.
      fs.unlinkSync(oldWork);
      fs.symlinkSync(sharedWork, oldWork, "dir");
    } else fs.mkdirSync(sharedWork, { recursive: true });
    fs.symlinkSync(sharedWork, path.join(candidate, "work"), "dir");
    setCurrent(candidate);
    // A failed CLI call can still have launched a server and its migrations.
    saveState("starting");
    candidateStarted = true;
    await startProcess(candidate, env);
    await ready(healthOrigin(env), id, { headers: healthHeaders(env) });
    const active = await getProcess();
    if (!active || active.pm2_env.status !== "online" || active.pm2_env.pm_exec_path !== path.join(candidate, "server.js")) {
      throw new Error("PM2 is not running the expected release");
    }
    healthy = true;
    saveState("healthy");
    await run("pm2", ["save"]);
    console.log(`Deployment healthy: ${candidate}. Previous release retained: ${previous || "none"}.`);
  } catch (error) {
    interrupted = false;
    if (healthy) {
      throw new Error(`New release is healthy and remains running, but deployment state/pm2 save failed: ${error.message}. Retry pm2 save.`);
    }
    console.error(error.message);
    try {
      if (touchedProcess) await removeProcess();
      if (previous && (!candidateStarted || manifest.migrationRollbackSafe)) {
        setCurrent(previous);
        if (oldProcess) {
          fs.mkdirSync(sharedWork, { recursive: true });
          await startProcess(previous, previousEnv);
          await ready(healthOrigin(previousEnv), previousEnv.TGTV_RELEASE_ID || "", { headers: healthHeaders(previousEnv) });
        }
        try { saveState("rolled-back"); } catch { console.error("Could not record rollback state on disk"); }
        await run("pm2", ["save", "--force"]);
        console.error(`Previous release restored: ${previous}`);
      } else {
        // Candidate migrations may have committed partially. Never reverse schema/data here.
        try { saveState("manual-recovery-required"); } catch { console.error("Could not record recovery state on disk"); }
        await run("pm2", ["save", "--force"]);
        console.error(`Automatic rollback unavailable. App stopped; inspect migrations and PM2 logs. Previous: ${previous || "none"}; candidate: ${candidate}.`);
      }
    } catch (recoveryError) {
      try { saveState("recovery-failed"); } catch { /* Preserve the original recovery error. */ }
      console.error(`Recovery failed: ${recoveryError.message}. Inspect PM2 and ${candidate}/.release.json.`);
    }
    throw new Error("Deployment failed; see recovery status above");
  }
}

if (require.main === module) {
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    interrupted = true;
    if (child) child.kill("SIGTERM");
  });
  const args = process.argv.slice(2);
  (args[0] === "--preflight" ? preflight() : deploy(args)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { inside, migrationFingerprint, healthOrigin, healthHeaders, ready };
