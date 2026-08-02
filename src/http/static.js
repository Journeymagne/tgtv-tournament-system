const fs = require("node:fs");
const path = require("node:path");

const { PUBLIC_DIR } = require("../config");
const { SECURITY_HEADERS, sendText } = require("./io");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const PUBLIC_PREFIX = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;

function resolveStaticPath(pathname) {
  let requested;
  try {
    requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (requested.includes("\0")) return null;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_PREFIX)) return null;
  return filePath;
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendText(res, 404, "Not found");
      return;
    }
    const ext = path.extname(filePath);
    const cacheControl = ext === ".html" ? "no-store, max-age=0" : "public, max-age=604800";
    if (res.headersSent) return;
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      ...SECURITY_HEADERS
    });
    res.end(data);
  });
}

module.exports = { resolveStaticPath, sendStatic, MIME };
