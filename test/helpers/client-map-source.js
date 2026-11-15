// Dependencies for tests that evaluate extracted app renderers in isolation.
const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.join(__dirname, '../../public');
const app = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
const moduleSource = fs.readFileSync(path.join(publicDir, 'map-catalog.js'), 'utf8');
const data = fs.readFileSync(path.join(publicDir, 'maps/catalog.json'), 'utf8');
const helpers = ['mapLayoutNumbers', 'mapLayoutLabel', 'teamTableImageMarkup'].map(name => {
  const match = app.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`));
  if (!match) throw new Error(`Missing renderer dependency: ${name}`);
  return match[0];
});
module.exports = `var TGTVMapCatalog = (() => {
  const module = { exports: {} }; const require = () => (${data});
  ${moduleSource}
  return module.exports;
})();\n${helpers.join('\n')}`;
