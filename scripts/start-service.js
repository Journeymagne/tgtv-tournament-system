const path = require('node:path'), fs = require('node:fs');
const { serviceName, DEFAULT_PORTS } = require('../src/services/catalog');
const { sanitizeServiceEnvironment } = require('./service-environment');

function singleServiceEnvironment(base, value) {
  const service = serviceName(value);
  if (service === 'monolith') throw Error('Choose a service name');
  const env = { ...base, SERVICE_NAME: service,
    PORT: base[service.toUpperCase() + '_PORT'] || String(DEFAULT_PORTS[service] || base.PORT || 3000) };
  if (['gateway', 'calculators'].includes(service)) env.DATABASE_URL = '';
  else {
    const explicit = base[service.toUpperCase() + '_DATABASE_URL'];
    if (explicit) env.DATABASE_URL = explicit;
    else {
      const password = base[service.toUpperCase() + '_DB_PASSWORD'];
      if (!password) throw Error('Missing service database password');
      const database = new URL(base.DATABASE_URL);
      database.username = 'kt_' + service; database.password = password; env.DATABASE_URL = database.href;
    }
  }
  return sanitizeServiceEnvironment(env, service);
}
function main() {
  const file = path.resolve(__dirname, '..', '.env');
  if (process.env.TGTV_ENV_LOADED !== '1' && fs.existsSync(file)) process.loadEnvFile(file);
  const env = singleServiceEnvironment(process.env, process.argv[2]);
  // This launcher starts in-process: deleted keys must also leave process.env.
  for (const key of Object.keys(process.env)) if (!Object.hasOwn(env, key)) delete process.env[key];
  Object.assign(process.env, env);
  const app = require('../server');
  app.start().catch(error => { console.error(error); process.exit(1); });
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => app.stop().then(() => process.exit(0)).catch(() => process.exit(1)));
}
if (require.main === module) main();
module.exports = { singleServiceEnvironment };
