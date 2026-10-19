const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");
const { SECURITY_HEADERS, sendJson, sendText } = require("./io");

const SERVICE_ROOT = path.join(ROOT, "services", "combat-lab");
const BUILD_ROOT = path.join(SERVICE_ROOT, "build-companion");
const BUILD_PREFIX = BUILD_ROOT + path.sep;
const ASSET_VERSION = require("../../package.json").version;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf", ".woff2": "font/woff2", ".map": "application/json"
};
let catalog;
function getCatalog() {
  if (!catalog) catalog = JSON.parse(fs.readFileSync(path.join(SERVICE_ROOT, "public/catalog.json"), "utf8"));
  return catalog;
}
function buildReady() {
  try {
    return ["index.html", "asset-manifest.json"].every(file => fs.statSync(path.join(BUILD_ROOT, file)).isFile());
  } catch { return false; }
}
function companionHtml(source) {
  // Resolve shared chrome on the Companion server so header/account updates
  // apply even when an unchanged calculator build is reused across releases.
  const head = `<script src="/theme-boot.js?v=${ASSET_VERSION}" data-companion-only></script>
<link rel="stylesheet" href="/companion-shell.css?v=20261018-services2">
<script src="/companion-sites.js?v=${ASSET_VERSION}" defer></script>
<script src="/companion-i18n.js?v=${ASSET_VERSION}" defer></script>
<script src="/combat/companion-ui.js" defer></script>
<script src="/companion-shell.js?v=20261018-public2" defer></script>`;
  return source.replace("<head>", "<head>" + head)
    .replace("<body>", '<body data-companion-section="combat">')
    .replace('<div id="root">', '<div data-companion-nav></div><div id="root">');
}
function sendFile(req, res, filename, missingStatus = 404) {
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) {
      sendText(res, missingStatus, missingStatus === 503 ? "Калькулятор временно недоступен. Попробуйте позже." : "Not found");
      return;
    }
    if (path.extname(filename) === ".html") {
      fs.readFile(filename, "utf8", (readError, source) => {
        if (readError) { sendText(res, 500, "Server error"); return; }
        const html = companionHtml(source);
        res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": MIME[".html"], "Content-Length": Buffer.byteLength(html), "Cache-Control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : html);
      });
      return;
    }
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME[path.extname(filename)] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": path.extname(filename) === ".html" ? "no-store" : "no-cache"
    });
    if (req.method === "HEAD") { res.end(); return; }
    const stream = fs.createReadStream(filename);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}
function handleCombatRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (!/^\/combat(?:\/|$)/.test(url.pathname)) return false;
  if (!["GET", "HEAD"].includes(req.method)) {
    sendText(res, 405, "Method not allowed", { Allow: "GET, HEAD" });
    return true;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname.slice("/combat".length) || "/"); }
  catch { sendText(res, 400, "Bad request"); return true; }
  if (pathname.includes("\0")) { sendText(res, 400, "Bad request"); return true; }
  if (pathname === "/api/health") {
    const ready = buildReady();
    sendJson(res, ready ? 200 : 503, { status: ready ? "ok" : "unavailable", buildReady: ready, service: "Companion Combat Lab", snapshot: "2026-09-25", ...getCatalog().counts });
    return true;
  }
  if (pathname === "/api/catalog") { sendJson(res, 200, getCatalog()); return true; }
  if (pathname.startsWith("/api/")) { sendText(res, 404, "Not found"); return true; }
  const pdf = /^\/library\/([a-z0-9-]+)\.pdf$/.exec(pathname);
  if (pdf) {
    const library = process.env.COMBAT_REFERENCE_DIR;
    if (!library || !getCatalog().teams.some(team => team.id === pdf[1])) sendText(res, 404, "Source PDF unavailable");
    else sendFile(req, res, path.join(library, "pdfs/team-rules", pdf[1] + ".pdf"));
    return true;
  }
  const filename = path.resolve(BUILD_ROOT, "." + pathname);
  if (filename !== BUILD_ROOT && !filename.startsWith(BUILD_PREFIX)) { sendText(res, 403, "Forbidden"); return true; }
  fs.stat(filename, (error, stat) => {
    if (!error && stat.isFile()) sendFile(req, res, filename);
    else if (!path.extname(pathname)) sendFile(req, res, path.join(BUILD_ROOT, "index.html"), 503);
    else sendText(res, 404, "Not found");
  });
  return true;
}
module.exports = { handleCombatRequest };
