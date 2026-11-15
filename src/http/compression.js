// Content-encoding negotiation, shared by the static file server and the JSON
// API. Both need the same rules; keeping one copy means a client that gets
// brotli for app.js also gets it for /api/games.
const zlib = require("node:zlib");

// Below this the framing overhead eats the saving.
const MIN_COMPRESS_BYTES = 1024;

// Brotli is preferred over gzip: on this app's payloads it is both smaller and,
// measurably, faster than gzip at level 6. Quality 5 is the point where more
// effort stops paying for itself on JSON.
const BROTLI_OPTIONS = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } };
const GZIP_OPTIONS = { level: 6 };

// Picks the best encoding the client actually asked for. Quality values are
// parsed only far enough to honour an explicit `q=0` refusal.
function negotiateEncoding(acceptEncoding) {
  if (!acceptEncoding) return null;
  const offered = new Map();
  for (const part of String(acceptEncoding).split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (!name) continue;
    const q = params
      .map((p) => p.trim())
      .filter((p) => p.startsWith("q="))
      .map((p) => Number(p.slice(2)))[0];
    offered.set(name.trim().toLowerCase(), Number.isFinite(q) ? q : 1);
  }
  if (offered.get("br") > 0) return "br";
  if (offered.get("gzip") > 0) return "gzip";
  return null;
}

function compressSync(buffer, encoding) {
  return encoding === "br"
    ? zlib.brotliCompressSync(buffer, BROTLI_OPTIONS)
    : zlib.gzipSync(buffer, GZIP_OPTIONS);
}

// Async on purpose. API responses are unbounded in a way static assets are not:
// a megabyte-scale JSON body costs 100+ ms to compress, and doing that
// synchronously would stall every other request in flight.
function compress(buffer, encoding, done) {
  const callback = (err, encoded) => done(err, err ? null : encoded);
  if (encoding === "br") zlib.brotliCompress(buffer, BROTLI_OPTIONS, callback);
  else zlib.gzip(buffer, GZIP_OPTIONS, callback);
}

module.exports = { MIN_COMPRESS_BYTES, negotiateEncoding, compress, compressSync };
