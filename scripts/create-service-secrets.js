const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { parseEnv } = require('node:util');
const { SCHEMAS } = require('../src/db/schemas');

function createServiceSecrets(app) {
  if (!app || !path.isAbsolute(app) || app === path.parse(app).root) throw Error('Provide the absolute managed app path');
  const shared = `${app}-shared`, file = path.join(shared, 'service-secrets.env');
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const values = parseEnv(original), missing = [];
  // Reject corrupt existing credentials before writing or generating replacements.
  for (const schema of SCHEMAS) {
    const key = schema.toUpperCase() + '_DB_PASSWORD';
    if (!Object.hasOwn(values, key)) missing.push(key);
    else if (!/^[0-9a-f]{64}$/.test(values[key])) throw Error('Invalid existing service credentials');
  }
  if (missing.length) {
    fs.mkdirSync(shared, { recursive: true, mode: 0o700 });
    const temporary = file + '.' + randomBytes(12).toString('hex') + '.tmp';
    const updated = original + (original && !original.endsWith('\n') ? '\n' : '') +
      missing.map(key => `${key}=${randomBytes(32).toString('hex')}`).join('\n') + '\n';
    try {
      fs.writeFileSync(temporary, updated, { mode: 0o600, flag: 'wx' });
      // Refuse to replace a file another operator changed while it was being read.
      if ((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '') !== original) throw Error('Service credentials changed concurrently; retry');
      fs.renameSync(temporary, file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  fs.chmodSync(file, 0o600);
  return file;
}
if (require.main === module) {
  try {
    createServiceSecrets(process.argv[2]);
    console.log('Service credentials ready in private shared storage; existing passwords retained.');
  } catch (error) {
    console.error(error.message); process.exitCode = 1;
  }
}
module.exports = { createServiceSecrets };
