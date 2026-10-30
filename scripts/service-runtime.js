// Invoked by the release deployer under the same flock as monolith deployment.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { parseEnv } = require('node:util');
const { SERVICES, DEFAULT_PORTS } = require('../src/services/catalog');
const ALL = [...SERVICES, 'gateway'];
const fileEnv = file => parseEnv(fs.readFileSync(file, 'utf8'));
const statePath = app => `${app}-shared/runtime.json`;
function readState(app) { return fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : null; }
function writeJson(file, data) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function serviceEnvironment(base, service, releaseId) {
  if (!ALL.includes(service)) throw Error('Unknown service');
  const env = { ...base, NODE_ENV: 'production', TGTV_ENV_LOADED: '1', TGTV_RELEASE_ID: releaseId,
    SERVICE_NAME: service, HOST: '127.0.0.1', PORT: String(service === 'gateway' ? base.PORT || 3000 : base[service.toUpperCase() + '_PORT'] || DEFAULT_PORTS[service]),
    DB_POOL_SIZE: String(base.SERVICE_DB_POOL_SIZE || 3), TRUST_PROXY: service === 'gateway' ? base.TRUST_PROXY || 'false' : 'true' };
  if (['gateway', 'calculators'].includes(service)) env.DATABASE_URL = '';
  else {
    const password = base[service.toUpperCase() + '_DB_PASSWORD'];
    if (!password || password.length < 24) throw Error('Missing database password for ' + service);
    const database = new URL(base.DATABASE_URL);
    database.username = 'kt_' + service; database.password = password;
    env.DATABASE_URL = database.href;
  }
  for (const name of SERVICES) {
    delete env[name.toUpperCase() + '_DB_PASSWORD'];
    delete env[name.toUpperCase() + '_DATABASE_URL'];
    env[name.toUpperCase() + '_URL'] = `http://127.0.0.1:${base[name.toUpperCase() + '_PORT'] || DEFAULT_PORTS[name]}`;
  }
  if (service !== 'accounts') {
    for (const key of Object.keys(env)) if (/^(EMAIL_|RESEND_)/.test(key)) delete env[key];
    env.EMAIL_PROVIDER = 'disabled';
  }
  if (service !== 'tournaments') {
    for (const key of Object.keys(env)) if (/^TELEGRAM_/.test(key)) delete env[key];
    env.TELEGRAM_MODE = 'disabled';
  }
  return env;
}
function environments(base, id) {
  const result = Object.fromEntries(ALL.map(service => [service, serviceEnvironment(base, service, id)]));
  const ports = ALL.map(service => Number(result[service].PORT));
  if (new Set(ports).size !== ports.length || ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw Error('Invalid or duplicate service ports');
  return result;
}
function run(command, args, { env = process.env, cwd, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let output = '';
    if (capture) { child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume(); }
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(Error(`${command} failed (${code}); inspect private service logs`)));
  });
}
function request(origin, route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(origin + route, { headers, timeout: 3000 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 4 * 1024 * 1024) req.destroy(Error('Oversized health response')); });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => req.destroy(Error('Readiness timeout'))); req.on('error', reject);
  });
}
async function waitForService(env, service) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await request(`http://127.0.0.1:${env.PORT}`, '/health/ready');
      if (response.status === 200 && JSON.parse(response.body).service === service && response.headers['x-kt-release'] === env.TGTV_RELEASE_ID) return;
    } catch { /* Startup may still be opening the database connection. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error('Service did not become ready: ' + service);
}
async function verifyGateway(env) {
  const origin = `http://127.0.0.1:${env.PORT}`;
  const headers = env.COMPANION_ORIGIN ? { Host: new URL(env.COMPANION_ORIGIN).host } : {};
  for (const [route, service, status] of [['/', 'gateway', 200], ['/api/session', 'accounts', 200],
    ['/api/me', 'tournaments', 200], ['/api/notifications', 'notifications', 401],
    ['/api/studio/library', 'studio', 200], ['/api/faq', 'faq', 200],
    ['/knowthykt', 'knowthykt', 200], ['/combat/api/health', 'calculators', 200]]) {
    const response = await request(origin, route, headers);
    if (response.status !== status || response.headers['x-kt-service'] !== service || response.headers['x-kt-release'] !== env.TGTV_RELEASE_ID) throw Error('Gateway route failed: ' + route);
    if (route === '/combat/api/health' && JSON.parse(response.body).buildReady !== true) throw Error('Calculator build unavailable');
  }
}
// All writers from the previous mode stop before any new worker starts.
async function transition(ops, previous, next, rollbackSafe) {
  await ops.stop();
  try {
    await ops.prepare(next);
    await ops.point(next);
    await ops.start(next);
    await ops.verify(next);
    await ops.save(next);
  } catch (error) {
    await ops.stop();
    if (previous && rollbackSafe) {
      await ops.point(previous); await ops.start(previous); await ops.verify(previous); await ops.save(previous);
      throw Error(`Deployment failed; previous runtime restored: ${error.message}`);
    }
    throw Error(`Deployment failed; automatic rollback unavailable: ${error.message}`);
  }
}
async function switchRelease({ app, name, candidate, id, mode, migrationRollbackSafe, migrate = true }) {
  if (process.env.TGTV_DEPLOY_LOCKED !== app) throw Error('Deployment lock required');
  if (!['services', 'monolith'].includes(mode)) throw Error('Invalid runtime mode');
  const releases = `${app}-releases${path.sep}`;
  if (![candidate, fs.realpathSync(app)].every(directory => directory.startsWith(releases))) throw Error('Runtime must use managed release directories');
  const shared = `${app}-shared`, work = path.join(shared, 'work');
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(path.join(candidate, 'work'))) fs.symlinkSync(work, path.join(candidate, 'work'), 'dir');
  const secretsFile = path.join(shared, 'service-secrets.env');
  const secrets = fs.existsSync(secretsFile) ? fileEnv(secretsFile) : {};
  const current = readState(app);
  const previous = { mode: current?.mode || 'monolith', directory: fs.realpathSync(app),
    id: current?.id || path.basename(fs.realpathSync(app)) };
  const next = { mode, directory: candidate, id };
  const baseEnv = target => ({ ...process.env, ...fileEnv(path.join(target.directory, '.env')), ...secrets,
    TGTV_ENV_LOADED: '1', TGTV_RELEASE_ID: target.id, NODE_ENV: 'production' });
  if (mode === 'services') environments(baseEnv(next), id); // Validate before stopping anything.
  const managed = [name, ...SERVICES.map(service => `${name}-${service}`)];
  const processes = async () => JSON.parse(await run('pm2', ['jlist'], { capture: true }));
  for (const proc of await processes()) if (managed.includes(proc.name) && !proc.pm2_env.pm_exec_path.startsWith(releases)) throw Error('Refusing to replace an unmanaged PM2 process');
  writeJson(path.join(shared, 'rollback.json'), { ...previous, rollbackSafe: migrationRollbackSafe });
  const stop = async () => {
    const running = await processes();
    // Gateway first, then workers. Removing PM2 entries disables automatic restarts.
    for (const processName of managed) if (running.some(proc => proc.name === processName)) await run('pm2', ['delete', processName], { capture: true });
  };
  const start = async target => {
    const base = baseEnv(target);
    const entries = target.mode === 'services' ? Object.entries(environments(base, target.id)) : [['monolith', { ...base, SERVICE_NAME: 'monolith' }]];
    for (const [service, env] of entries) {
      const processName = ['gateway', 'monolith'].includes(service) ? name : `${name}-${service}`;
      await run('pm2', ['start', path.join(target.directory, 'server.js'), '--name', processName, '--cwd', target.directory,
        '--interpreter', process.execPath, '--kill-timeout', '10000', '--time',
        '--output', path.join(work, processName + '.out.log'), '--error', path.join(work, processName + '.err.log')], { env, capture: true });
      await waitForService(env, service);
    }
  };
  await transition({ stop,
    prepare: async target => {
      if (!migrate) return;
      await run(process.execPath, [path.join(target.directory, 'scripts/migrate.js')], { env: baseEnv(target), cwd: target.directory });
      if (target.mode === 'services') await run(process.execPath, [path.join(target.directory, 'scripts/provision-service-roles.js')], { env: baseEnv(target), cwd: target.directory });
    },
    point: async target => {
      const temporary = app + '.runtime-' + process.pid;
      fs.symlinkSync(target.directory, temporary, 'dir'); fs.renameSync(temporary, app);
    }, start,
    verify: async target => {
      if (target.mode === 'services') await verifyGateway(environments(baseEnv(target), target.id).gateway);
      else {
        const { ready, healthOrigin, healthHeaders } = require('./deploy-release');
        await ready(healthOrigin(baseEnv(target)), target.id, { headers: healthHeaders(baseEnv(target)) });
      }
    },
    save: async target => { writeJson(statePath(app), target); await run('pm2', ['save'], { capture: true }); }
  }, previous, next, migrationRollbackSafe);
  console.log(`Runtime healthy: ${mode}; release ${id}. Previous runtime retained in ${shared}/rollback.json`);
}
if (require.main === module) {
  const [command, app, name] = process.argv.slice(2);
  if (command !== '--rollback' || !path.isAbsolute(app || '') || !/^[\w-]+$/.test(name || '')) throw Error('Usage: service-runtime.js --rollback /absolute/app pm2-name (under deployment lock)');
  const previous = JSON.parse(fs.readFileSync(`${app}-shared/rollback.json`, 'utf8'));
  if (!previous.rollbackSafe) throw Error('Database compatibility not verified; manual recovery required');
  switchRelease({ app, name, candidate: previous.directory, id: previous.id, mode: previous.mode, migrationRollbackSafe: true, migrate: false })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { serviceEnvironment, environments, readState, switchRelease, transition, verifyGateway };
