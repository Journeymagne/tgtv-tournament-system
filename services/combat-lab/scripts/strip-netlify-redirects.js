// Removes build/_redirects before a Cloudflare Workers deploy.
//
// public/_redirects holds Netlify's SPA fallback (`/*  /index.html  200`).
// Cloudflare's API rejects that exact rule as an infinite loop (error 100324)
// and fails the whole deploy. On Workers the same job is done by
// `assets.not_found_handling = "single-page-application"` in wrangler.jsonc,
// so the file is simply dropped from the Cloudflare upload. Netlify's build
// (`npm run build:react`) never runs this, so its _redirects is untouched.
// Runs last in `npm run build:cloudflare`, after scripts/prerender.js.
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'build', '_redirects');
fs.rmSync(file, { force: true });
console.log(`strip-netlify-redirects: removed ${path.relative(process.cwd(), file)} (if present)`);
