const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { parseEnv } = require('node:util');
const { SCHEMAS } = require('../src/db/schemas');
const app = process.argv[2];
if (!app || !path.isAbsolute(app) || app === path.parse(app).root) throw Error('Provide the absolute managed app path');
const shared = `${app}-shared`;
fs.mkdirSync(shared, { recursive: true, mode: 0o700 });
const file = path.join(shared, 'service-secrets.env');
if (!fs.existsSync(file)) fs.writeFileSync(file,
  SCHEMAS.map(schema => `${schema.toUpperCase()}_DB_PASSWORD=${randomBytes(32).toString('hex')}`).join('\n') + '\n',
  { mode: 0o600, flag: 'wx' });
const values = parseEnv(fs.readFileSync(file, 'utf8'));
for (const schema of SCHEMAS) if (!/^[0-9a-f]{64}$/.test(values[schema.toUpperCase() + '_DB_PASSWORD'] || '')) throw Error('Invalid existing service credentials');
fs.chmodSync(file, 0o600);
console.log('Service credentials ready in private shared storage; existing passwords retained.');
