const fs = require("node:fs");
const path = require("node:path");

const { PUBLIC_DIR } = require("../config");
const { SECURITY_HEADERS, sendText } = require("./io");
const { MIN_COMPRESS_BYTES, negotiateEncoding, compressSync } = require("./compression");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

// Only text-shaped payloads are worth compressing; png/ico/woff2 are already
// compressed and re-encoding them costs CPU for a larger body.
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".svg", ".txt", ".map"]);

const PUBLIC_PREFIX = PUBLIC_DIR.endsWith(path.sep) ? PUBLIC_DIR : PUBLIC_DIR + path.sep;

// filePath -> { mtimeMs, size, etag, raw, gzip, br }. The client bundle is a
// single ~430 KB file requested on every cold load; re-reading and
// re-compressing it per request is the dominant cost of serving this app.
// Entries are revalidated against fs.stat, so an edit on disk still wins.
const fileCache = new Map();

function resolveStaticPath(pathname) {
  let requested;
  try {
    requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (requested.includes("\0")) return null;
  // Team profiles use client-side rendering, including on direct visits/reloads.
  if (/^\/teams\/[^/\\]+\/?$/.test(requested)) return path.join(PUBLIC_DIR, "index.html");
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_PREFIX)) return null;
  return filePath;
}

// Static bodies are compressed synchronously and cached per file: unlike API
// responses they are bounded in size and the result is reused across requests.
function encodedBody(entry, encoding) {
  if (!encoding) return entry.raw;
  if (entry[encoding]) return entry[encoding];
  const encoded = compressSync(entry.raw, encoding);
  // A compressed body larger than the original is never worth sending.
  entry[encoding] = encoded.length < entry.raw.length ? encoded : entry.raw;
  return entry[encoding];
}

function loadFile(filePath, done) {
  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      done(statErr || new Error("not a file"));
      return;
    }
    const cached = fileCache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      done(null, cached);
      return;
    }
    fs.readFile(filePath, (readErr, raw) => {
      if (readErr) {
        done(readErr);
        return;
      }
      const entry = {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        etag: `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`,
        raw,
        gzip: null,
        br: null
      };
      fileCache.set(filePath, entry);
      done(null, entry);
    });
  });
}

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const filePath = resolveStaticPath(url.pathname);
  if (!filePath) {
    sendText(res, 403, "Forbidden");
    return;
  }

  loadFile(filePath, (err, entry) => {
    if (err) {
      sendText(res, 404, "Not found");
      return;
    }
    if (res.headersSent) return;

    const ext = path.extname(filePath);
    // index.html carries the `?v=` markers that bust every other asset, so it
    // must never be cached itself. Assets requested with an explicit version
    // marker can be treated as immutable for that version.
    const cacheControl =
      ext === ".html"
        ? "no-store, max-age=0"
        : url.searchParams.has("v")
          ? "public, max-age=604800, immutable"
          : "public, max-age=604800";

    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      ETag: entry.etag,
      ...SECURITY_HEADERS
    };

    if (req.headers["if-none-match"] === entry.etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    const canCompress = COMPRESSIBLE.has(ext) && entry.raw.length >= MIN_COMPRESS_BYTES;
    const encoding = canCompress ? negotiateEncoding(req.headers["accept-encoding"]) : null;
    if (canCompress) headers.Vary = "Accept-Encoding";

    const body = encodedBody(entry, encoding);
    if (encoding && body !== entry.raw) headers["Content-Encoding"] = encoding;
    headers["Content-Length"] = body.length;

    res.writeHead(200, headers);
    res.end(body);
  });
}

module.exports = { resolveStaticPath, sendStatic, MIME };
