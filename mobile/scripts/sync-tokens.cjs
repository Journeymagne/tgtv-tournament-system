const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, '../public/companion-tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
function values(body) { return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m=>[m[1],m[2].trim()])); }
const dark = values(css.match(/:root\s*\{([\s\S]*?)\}/)[1]);
const light = {...dark, ...values(css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)[1])};
const palette = source => Object.fromEntries(Object.entries(source).filter(([key])=>['bg','surface','panel','panel-2','panel-3','ink','muted','quiet','line','line-strong','accent','accent-text','accent-hover','on-accent','good','danger','surface-input','surface-medallion','gold'].includes(key)).map(([key,value])=>[key.replace(/-([a-z0-9])/g,(_,c)=>c.toUpperCase()),value.startsWith('var(')?source[value.slice(6,-1)]:value]));
fs.writeFileSync(path.join(root,'src/tokens.ts'), '// Generated from public/companion-tokens.css. Run npm run tokens.\nexport const palettes = '+JSON.stringify({dark:palette(dark),light:palette(light)},null,2)+' as const;\nexport const controls = {radius:7,fontSize:14,fontWeight:"650" as const,lineHeight:14,paddingHorizontal:12,height:48,icon:22};\n');
