const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../../public/app.js'),'utf8');
module.exports = ['canOpenAdministration','canManageTournamentUi','canManageGameUi'].map(name=>{
  const body=source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  if(!body)throw Error(`Missing ${name}`);
  return body;
}).join('\n');
