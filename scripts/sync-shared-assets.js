const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { authFields } = require('./lib/auth-form');
const root = path.join(__dirname, '..');
const readSource = filename => fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n');
// Include dynamically loaded dependencies of theme-boot and notifications too.
const assets = [
  'theme-boot.js', 'companion-tokens.css', 'companion-shell.css', 'companion-shell.js',
  'companion-i18n.js', 'companion-auth.js', 'companion-notifications.js',
  'companion-notifications.css', 'companion/css/common.css', 'companion/css/base.css',
  'companion/css/components.css', 'companion/css/nav.css', 'training/journey-shared.css',
  'exodite-runner.css', 'styles.css', 'dice/dice.css', 'miniapp/app.css',
  'account-email.css', 'faq/faq.css', 'studio/style.css', 'account/account.js',
  'studio/login.js', 'studio/account.js', 'i18n/ru.js', 'i18n/en.js',
  'documentation.js', 'documentation.css'
];
const versioned = [...assets, 'companion-sites.js'];
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Absolute URLs in HTML/JS and sibling paths in common.css imports.
const patterns = versioned.map(asset => new RegExp(
  `(/${escaped(asset)}|(?<=url\\(")${escaped(path.basename(asset))})(?:\\?v=[^"'\\s)<>;]+)?(?=["'])`, 'g'));
function rewrite(source, version) {
  for (const pattern of patterns) source = source.replace(pattern, (_, pathname) => `${pathname}?v=${version}`);
  return source;
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'vendor') return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : /\.(html|css|js)$/.test(entry.name) ? [filename] : [];
  });
}
function outputs() {
  const result = new Map();
  for (const kind of ['account', 'studio']) {
    const filename = path.join(root, 'public', kind, 'index.html');
    const source = readSource(filename);
    const marker = /<!-- shared-auth-fields:start -->[\s\S]*?<!-- shared-auth-fields:end -->/;
    if (!marker.test(source)) throw Error(`Missing shared auth field markers: ${filename}`);
    result.set(filename, source.replace(marker, `<!-- shared-auth-fields:start -->\n${authFields(kind)}\n<!-- shared-auth-fields:end -->`));
  }
  const hash = crypto.createHash('sha256');
  for (const asset of assets) {
    hash.update(asset + '\0').update(rewrite(readSource(path.join(root, 'public', asset)), 'SHARED'));
  }
  // Generated markup and dynamic site configuration are also version inputs.
  hash.update(authFields('account')).update(authFields('studio'));
  hash.update(readSource(path.join(root, 'src/http/sites.js')));
  const version = 'shared-' + hash.digest('hex').slice(0, 12);
  for (const filename of walk(path.join(root, 'public'))) {
    result.set(filename, rewrite(result.get(filename) ?? readSource(filename), version));
  }
  result.set(path.join(root, 'src/http/shared-assets.json'), JSON.stringify({ version, assets: versioned }, null, 2) + '\n');
  return result;
}
function sync(check = false) {
  const stale = [];
  for (const [filename, source] of outputs()) {
    if (fs.existsSync(filename) && readSource(filename) === source) continue;
    stale.push(path.relative(root, filename));
    if (!check) fs.writeFileSync(filename, source);
  }
  if (check && stale.length) throw Error(`Run npm run assets:sync. Outdated shared assets:\n${stale.join('\n')}`);
  return stale;
}
if (require.main === module) {
  try { console.log(`Shared assets: ${sync(process.argv.includes('--check')).length} files updated.`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { sync, outputs };
