const fs = require("node:fs");
const path = require("node:path");
const { ROOT } = require("../config");
const { SECURITY_HEADERS, sendJson, sendText } = require("./io");

const SERVICE_ROOT = path.join(ROOT, "services", "combat-lab");
const BUILD_ROOT = path.join(SERVICE_ROOT, "build-companion");
const BUILD_PREFIX = BUILD_ROOT + path.sep;
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
function sendFile(req, res, filename, missingStatus = 404) {
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) {
      sendText(res, missingStatus, missingStatus === 503 ? "Калькулятор временно недоступен. Попробуйте позже." : "Not found");
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
