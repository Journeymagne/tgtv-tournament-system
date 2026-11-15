const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { createServiceSecrets } = require('../../scripts/create-service-secrets');
const { SCHEMAS } = require('../../src/db/schemas');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-service-secrets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'), shared = app + '-shared', file = path.join(shared, 'service-secrets.env');
  fs.mkdirSync(shared, { mode: 0o700 });
  return { app, shared, file };
}
function legacyCredentials() {
  return '# Retain existing service passwords and operator comments.\n' + SCHEMAS.filter(schema => schema !== 'tierlists')
    .map((schema, i) => `${schema.toUpperCase()}_DB_PASSWORD=${(i + 1).toString(16).repeat(64)}`).join('\n');
}

test('adding a service retains existing private credentials and generates only the missing password', t => {
  const { app, file, shared } = fixture(t), original = legacyCredentials();
  fs.writeFileSync(file, original, { mode: 0o600 });
  createServiceSecrets(app);
  const updated = fs.readFileSync(file, 'utf8'), values = parseEnv(updated);
  assert.ok(updated.startsWith(original + '\n'));
  assert.match(values.TIERLISTS_DB_PASSWORD, /^[0-9a-f]{64}$/);
  for (const [key, value] of Object.entries(parseEnv(original))) assert.equal(values[key], value);
  assert.deepEqual(fs.readdirSync(shared), ['service-secrets.env']);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  createServiceSecrets(app);
  assert.equal(fs.readFileSync(file, 'utf8'), updated);
});

test('an invalid existing password prevents every credential write even when a new service key is missing', t => {
  const { app, file, shared } = fixture(t);
  const original = legacyCredentials().replace(/ACCOUNTS_DB_PASSWORD=[^\n]+/, 'ACCOUNTS_DB_PASSWORD=invalid');
  fs.writeFileSync(file, original, { mode: 0o600 });
  assert.throws(() => createServiceSecrets(app), /Invalid existing service credentials/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(shared), ['service-secrets.env']);
});

test('an explicitly empty password remains invalid instead of being silently replaced', t => {
  const { app, file } = fixture(t);
  fs.writeFileSync(file, legacyCredentials() + '\nTIERLISTS_DB_PASSWORD=\n', { mode: 0o600 });
  assert.throws(() => createServiceSecrets(app), /Invalid existing service credentials/);
  assert.equal(parseEnv(fs.readFileSync(file, 'utf8')).TIERLISTS_DB_PASSWORD, '');
});

test('a fresh deployment creates a complete private credential file', t => {
  const { app, file } = fixture(t);
  createServiceSecrets(app);
  const values = parseEnv(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(values).sort(), SCHEMAS.map(schema => schema.toUpperCase() + '_DB_PASSWORD').sort());
  for (const value of Object.values(values)) assert.match(value, /^[0-9a-f]{64}$/);
});
