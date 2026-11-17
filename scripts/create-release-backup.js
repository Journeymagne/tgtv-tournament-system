const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { parseEnv } = require('node:util');
const ID = /^\d{8}T\d{9}Z-[a-f0-9]{12}$/;

function validateEntry(entry) {
  if (!entry || !ID.test(entry.id) || entry.file !== entry.id + '.dump' || !ID.test(entry.releaseId) ||
      !/^[a-f0-9]{40}$/.test(entry.commitSha) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || !Number.isFinite(Date.parse(entry.createdAt)) ||
      !/^\d+\.\d+\.\d+$/.test(entry.version) || !['release', 'baseline'].includes(entry.kind)) throw Error('Invalid release-backup manifest');
  return entry;
}
function realRoot(root) {
  if (!path.isAbsolute(root) || !fs.lstatSync(root).isDirectory() || fs.realpathSync(root) !== root) throw Error('Backup root must be a real directory');
}
function readIndex(root) {
  realRoot(root);
  const file = path.join(root, 'index.json');
  if (!fs.existsSync(file)) return { schema: 1, backups: [] };
  if (!fs.lstatSync(file).isFile()) throw Error('Backup index must be a regular file');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (index.schema !== 1 || !Array.isArray(index.backups) || index.backups.length > 2 || new Set(index.backups.map(e => e.id)).size !== index.backups.length) throw Error('Invalid backup index manifest');
  index.backups.forEach(validateEntry);
  return index;
}
function backupFile(root, entry) {
  validateEntry(entry);
  const file = path.join(root, entry.file), stat = fs.lstatSync(file);
  if (!stat.isFile() || fs.realpathSync(file) !== file) throw Error('Backup must be a regular file');
  if (stat.size !== entry.bytes) throw Error('Backup size does not match its manifest');
  return file;
}
function publishBackup(root, entry) {
  realRoot(root); backupFile(root, entry);
  const old = readIndex(root);
  if (old.backups.some(e => e.id === entry.id && e.sha256 !== entry.sha256)) throw Error('Refusing to replace a different backup with the same ID');
  const all = [entry, ...old.backups.filter(e => e.id !== entry.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const index = { schema: 1, updatedAt: new Date().toISOString(), backups: all.slice(0, 2) };
  const temporary = path.join(root, `.index-${process.pid}.tmp`);
  fs.writeFileSync(temporary, JSON.stringify(index, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  fs.renameSync(temporary, path.join(root, 'index.json'));
  // Publish the complete replacement index before removing old indexed files.
  for (const obsolete of all.slice(2)) fs.unlinkSync(backupFile(root, obsolete));
  return index;
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function createReleaseBackup(app, expectedSha) {
  if (process.platform !== 'linux' || process.env.TGTV_DEPLOY_LOCKED !== app || !path.isAbsolute(app) || path.resolve(app) !== app || app === '/') throw Error('Run under the Linux application deployment lock');
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '')) throw Error('Full expected release SHA required');
  const current = fs.realpathSync(app), releaseId = path.basename(current);
  if (path.dirname(current) !== app + '-releases' || !ID.test(releaseId) || !releaseId.endsWith('-' + expectedSha.slice(0, 12))) throw Error('Active release differs from expected deployment');
  const manifest = JSON.parse(fs.readFileSync(path.join(current, '.release.json'), 'utf8'));
  if (manifest.id !== releaseId || manifest.phase !== 'healthy') throw Error('Active release is not healthy');
  const version = JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8')).version;
  const root = app + '-shared/work/release-backups'; fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const existing = readIndex(root).backups.find(e => e.kind === 'release' && e.releaseId === releaseId && e.commitSha === expectedSha);
  if (existing) {
    if (await sha256(backupFile(root, existing)) !== existing.sha256) throw Error('Existing release backup checksum mismatch');
    return { reused: true, backup: existing, kept: readIndex(root).backups.length };
  }
  const env = parseEnv(fs.readFileSync(path.join(current, '.env'), 'utf8'));
  const target = new URL(env.DATABASE_URL), container = 'tgtv-tournament-postgres';
  const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))[0];
  const values = Object.fromEntries(info.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
  const database = decodeURIComponent(target.pathname.slice(1)), user = values.POSTGRES_USER;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || database !== values.POSTGRES_DB || info.State.Status !== 'running' ||
      !info.NetworkSettings.Ports?.['5432/tcp']?.some(port => port.HostPort === (target.port || '5432'))) throw Error('Configured database does not match the local PostgreSQL container');
  const createdAt = new Date().toISOString(), id = createdAt.replace(/[-:.]/g, '') + '-' + expectedSha.slice(0, 12);
  const final = path.join(root, id + '.dump'), partial = final + '.partial';
  const run = (args, fd) => execFileSync('docker', args, { stdio: fd, timeout: 15 * 60 * 1000, maxBuffer: 1024 * 1024 });
  let fd = fs.openSync(partial, 'wx', 0o600);
  try {
    try { run(['exec', container, 'pg_dump', '-U', user, '-d', database, '--format=custom', '--no-password'], ['ignore', fd, 'pipe']); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    for (const args of [['--list'], ['--file=/dev/null']]) {
      fd = fs.openSync(partial, 'r');
      try { run(['exec', '-i', container, 'pg_restore', ...args], [fd, 'ignore', 'pipe']); }
      finally { fs.closeSync(fd); }
    }
    const entry = { id, file: id + '.dump', createdAt, releaseId, commitSha: expectedSha, version, kind: 'release',
      bytes: fs.statSync(partial).size, sha256: await sha256(partial), verification: 'pg_dump -Fc; pg_restore --list; full archive extraction; SHA-256' };
    validateEntry(entry);
    if (fs.realpathSync(app) !== current) throw Error('Active release changed during backup');
    fs.renameSync(partial, final);
    const index = publishBackup(root, entry);
    return { reused: false, backup: entry, kept: index.backups.length };
  } catch (error) {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
    throw error;
  }
}
if (require.main === module) createReleaseBackup(...process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error('Release backup failed: ' + error.message); process.exitCode = 1; });
module.exports = { validateEntry, readIndex, publishBackup, sha256, createReleaseBackup };
