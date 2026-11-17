const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RELEASE_ID = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/;
const PHASES = new Set(['preparing', 'prepared', 'switching', 'starting', 'healthy',
  'rolled-back', 'manual-recovery-required', 'recovery-failed']);

function layout(app) {
  if (!path.isAbsolute(app) || path.resolve(app) !== app || app === path.parse(app).root) {
    throw Error('Use a normalized absolute application path');
  }
  const root = app + '-releases';
  if (!fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== root) {
    throw Error('Release root must be a real directory');
  }
  if (!fs.lstatSync(app).isSymbolicLink()) throw Error('Current application must be a managed symlink');
  const current = fs.realpathSync(app);
  if (path.dirname(current) !== root || !RELEASE_ID.test(path.basename(current))) {
    throw Error('Current release must be an immediate managed release directory');
  }
  return { app, root, current };
}

function inspect(root, id) {
  if (!RELEASE_ID.test(id)) throw Error('Unrecognized release name');
  const directory = path.join(root, id), stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || fs.realpathSync(directory) !== directory) throw Error('Not a real release directory');
  const manifestFile = path.join(directory, '.release.json');
  if (!fs.lstatSync(manifestFile).isFile()) throw Error('Manifest must be a regular file');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.id !== id || !PHASES.has(manifest.phase)) throw Error('Unrecognized release manifest');
  let physicalWork = false;
  try { physicalWork = !fs.lstatSync(path.join(directory, 'work')).isSymbolicLink(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { id, directory, phase: manifest.phase, device: stat.dev, inode: stat.ino, physicalWork };
}

function protectedByProcess(directory, processPaths) {
  return processPaths.some(file => {
    if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
    let resolved = path.resolve(file);
    try { resolved = fs.realpathSync(file); } catch { /* Protect even a missing script path. */ }
    return resolved === directory || resolved.startsWith(directory + path.sep);
  });
}

function planReleases(app, processPaths = []) {
  const base = layout(app), releases = [], skipped = [];
  for (const id of fs.readdirSync(base.root).sort()) {
    try { releases.push(inspect(base.root, id)); }
    catch (error) { skipped.push({ id, reason: error.message }); }
  }
  const current = releases.find(r => r.directory === base.current);
  if (!current || current.phase !== 'healthy') throw Error('Current release must have a healthy manifest before cleanup');
  const predecessors = releases.filter(r => r.phase === 'healthy' && r.id < current.id)
    .sort((a, b) => b.id.localeCompare(a.id)).slice(0, 2);
  const retained = new Set([current.id, ...predecessors.map(r => r.id)]);
  const keep = [], remove = [];
  for (const release of releases) {
    const reason = retained.has(release.id) ? (release.id === current.id ? 'current' : 'previous successful') :
      release.physicalWork ? 'physical work storage' :
        protectedByProcess(release.directory, processPaths) ? 'process reference' : null;
    if (reason) keep.push({ ...release, reason });
    else remove.push(release);
  }
  return { ...base, keep, remove, skipped };
}

function applyPlan(plan, processPaths = []) {
  // Recompute the whole plan before the first deletion, then check inode identity
  // again per target. The caller holds the same flock as deployments throughout.
  const fresh = planReleases(plan.app, processPaths);
  const signature = value => JSON.stringify({ root: value.root, current: value.current,
    remove: value.remove.map(r => [r.id, r.device, r.inode, r.phase]) });
  if (signature(fresh) !== signature(plan)) throw Error('Release cleanup plan changed; rerun inspection');
  const work = plan.app + '-shared/work';
  if (!fs.statSync(work).isDirectory() || fs.realpathSync(work).startsWith(plan.root + path.sep)) {
    throw Error('Cleanup audit must be outside the release root');
  }
  const audit = path.join(work, 'release-cleanup.jsonl');
  if (fs.existsSync(audit) && !fs.lstatSync(audit).isFile()) throw Error('Cleanup audit must be a regular file');
  const record = data => fs.appendFileSync(audit, JSON.stringify({ at: new Date().toISOString(), ...data }) + '\n', { mode: 0o600 });
  record({ event: 'planned', current: plan.current, keep: plan.keep.map(r => r.id), remove: plan.remove.map(r => r.id) });
  const deleted = [];
  for (const release of fresh.remove) {
    const now = layout(plan.app), target = inspect(now.root, release.id);
    if (now.current !== plan.current || target.directory === now.current ||
        target.device !== release.device || target.inode !== release.inode ||
        target.phase !== release.phase || target.physicalWork ||
        protectedByProcess(target.directory, processPaths)) throw Error('Release cleanup target changed; stopping');
    // fs.rm removes symlinks within this directory without following their targets.
    fs.rmSync(target.directory, { recursive: true });
    deleted.push(target.id);
    record({ event: 'deleted', id: target.id });
  }
  record({ event: 'completed', deleted: deleted.length });
  return { deleted, kept: fresh.keep.map(r => r.id), skipped: fresh.skipped };
}

function processPaths() {
  const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024 }));
  if (!Array.isArray(processes)) throw Error('Invalid PM2 process inventory');
  return processes.flatMap(proc => [proc.pm2_env?.pm_cwd, proc.pm2_env?.pm_exec_path]).filter(Boolean);
}

function prune(app, apply = false) {
  if (process.platform !== 'linux' || process.env.TGTV_DEPLOY_LOCKED !== app) {
    throw Error('Run on Linux under the application deployment lock');
  }
  const plan = planReleases(app, processPaths());
  if (!apply) return plan;
  return applyPlan(plan, processPaths());
}

async function cleanupAfterDeploy(app, { warn = console.warn } = {}) {
  try {
    const result = prune(app, true);
    console.log(`Release cleanup: deleted ${result.deleted.length}; retained ${result.kept.length}; skipped ${result.skipped.length}.`);
  } catch (error) {
    warn(`Release cleanup skipped: ${error.message}. The healthy release remains running.`);
  }
}

if (require.main === module) {
  try {
    const [app, mode, ...extra] = process.argv.slice(2);
    if (!['--dry-run', '--apply'].includes(mode) || extra.length) throw Error('Usage: prune-releases.js /absolute/app --dry-run|--apply (under deployment lock)');
    console.log(JSON.stringify(prune(app, mode === '--apply'), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { planReleases, applyPlan, cleanupAfterDeploy };
