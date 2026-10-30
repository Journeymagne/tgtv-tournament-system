const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { pipeline } = require('node:stream/promises');

function run(binary, args, env, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env, windowsHide: true, stdio: ['ignore', output ?? 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    child.on('error', error => reject(new Error(`Cannot run ${path.basename(binary)}: ${error.code}. Install PostgreSQL client tools or configure PG_DUMP_BIN / PG_RESTORE_BIN.`)));
    child.on('close', code => {
      const safeError = stderr.split(env.PGDATABASE || '\0').join('[database]')
        .replace(/(password\s*[=:]\s*)\S+/gi, '$1[redacted]');
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(binary)} failed (${code}). Backup not verified; migration aborted. ${safeError}`));
    });
  });
}

async function backupDatabase(connectionString, { ssl, directory } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is required for a verified backup');
  const target = new URL(connectionString);
  const root = path.resolve(directory || process.env.DB_BACKUP_DIR || path.join(__dirname, '../../work/backups'));
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(root, `before-tournament-normalization-${stamp}-${randomUUID()}.dump`);
  // libpq accepts a connection URI in PGDATABASE. Credentials never enter argv
  // or the manifest, including when a process listing is captured.
  const env = { ...process.env, PGDATABASE: connectionString };
  if (ssl && !target.searchParams.has('sslmode')) env.PGSSLMODE = ssl.rejectUnauthorized === false ? 'require' : 'verify-full';
  const output = fs.openSync(file, 'wx', 0o600);
  try {
    // pg_dump uses one consistent PostgreSQL snapshot of the entire database.
    await run(process.env.PG_DUMP_BIN || 'pg_dump', ['--format=custom', '--no-password'], env, output);
  } finally { fs.closeSync(output); }
  const listing = file + '.toc';
  const listFd = fs.openSync(listing, 'wx', 0o600);
  try {
    await run(process.env.PG_RESTORE_BIN || 'pg_restore', ['--list', file], env, listFd);
  } finally { fs.closeSync(listFd); }
  // Read/decompress every archive entry, not only the table of contents.
  await run(process.env.PG_RESTORE_BIN || 'pg_restore', ['--file=-', file], env);
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  const manifest = {
    file, bytes: (await fs.promises.stat(file)).size, sha256: hash.digest('hex'),
    database: decodeURIComponent(target.pathname.slice(1)), host: target.hostname,
    createdAt: new Date().toISOString(), verification: 'pg_restore --list; full SQL extraction; sha256',
    restoreDrillPerformed: false
  };
  await fs.promises.writeFile(file + '.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return manifest;
}

module.exports = { backupDatabase };
