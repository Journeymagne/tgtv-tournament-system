const { MAX_REQUEST_BYTES } = require("../config");
const { MIN_COMPRESS_BYTES, negotiateEncoding, compress } = require("./compression");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

class ValidationError extends HttpError {
  constructor(message) {
    super(400, message);
    this.name = "ValidationError";
  }
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join("; ")
};

function readBody(req, maxBytes = MAX_REQUEST_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, "Request body is too large"));
        // Discard remaining bytes without destroying the response socket:
        // the router must still be able to deliver the JSON 413 error.
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new ValidationError("Could not parse JSON"));
      }
    });
    req.on("error", reject);
  });
}

// Behind a reverse proxy, req.socket.remoteAddress is the proxy's own
// address, not the client's - every request looks like it came from the
// same place, which collapses a per-client rate limit into one shared
// bucket for the whole site (Blocker 1). trustProxy is false by default
// (see config.TRUST_PROXY) and is passed in explicitly - rather than read
// from config here - so tests can exercise both branches without touching
// process.env / module-cached config. When true, the client address is the
// RIGHTMOST entry of X-Forwarded-For: the one this app's own trusted proxy
// appended. The leftmost entries are whatever the client put in the header
// and are fully under its control, so they are never trusted.
function clientKey(req, trustProxy) {
  if (trustProxy) {
    const header = req.headers?.["x-forwarded-for"];
    if (header) {
      const chain = String(header)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (chain.length) return chain[chain.length - 1];
    }
  }
  return req.socket?.remoteAddress || null;
}

function parseCookies(req) {
  const cookie = req.headers.cookie || "";
  return Object.fromEntries(
    cookie
      .split(";")
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return ["", ""];
        return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
      })
      .filter(([key]) => key)
  );
}

// Marks a response whose body is being compressed. writeHead has not run yet at
// that point, so headersSent alone cannot stop a second handler from also
// writing to this response.
const jsonBodyPending = new WeakSet();

function sendJson(res, status, body, headers = {}) {
  if (res.headersSent || jsonBodyPending.has(res)) return;
  const payload = JSON.stringify(body);
  const length = Buffer.byteLength(payload);
  const base = {
    "Content-Type": "application/json; charset=utf-8",
    // Set whether or not this particular response ended up compressed: the same
    // URL answers differently per Accept-Encoding, and a shared cache must not
    // hand a brotli body to a client that never asked for one.
    Vary: "Accept-Encoding",
    ...SECURITY_HEADERS,
    ...headers
  };

  // res.req is the request Node itself attached. Reading it here keeps every
  // existing call site unchanged, and a hand-built response object in a test
  // simply has none and takes the uncompressed path.
  const acceptEncoding = res.req?.headers?.["accept-encoding"];
  const encoding = length >= MIN_COMPRESS_BYTES ? negotiateEncoding(acceptEncoding) : null;
  if (!encoding) {
    res.writeHead(status, { ...base, "Content-Length": length });
    res.end(payload);
    return;
  }

  jsonBodyPending.add(res);
  compress(Buffer.from(payload), encoding, (err, encoded) => {
    jsonBodyPending.delete(res);
    if (res.headersSent) return;
    // A failed or counter-productive compression still owes the client a body.
    if (err || encoded.length >= length) {
      res.writeHead(status, { ...base, "Content-Length": length });
      res.end(payload);
      return;
    }
    res.writeHead(status, {
      ...base,
      "Content-Length": encoded.length,
      "Content-Encoding": encoding
    });
    res.end(encoded);
  });
}

// Stored files served from the database: never scripts, never framed, and not
// worth re-compressing (PDF and JPEG payloads are already compressed).
const ATTACHMENT_SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'"
};

function sendBinary(res, status, buffer, contentType, headers = {}) {
  if (res.headersSent) return;
  // 304 carries no body, and repeating Content-Type/Length on it is wrong.
  const body = status === 304 ? null : buffer;
  res.writeHead(status, {
    ...(body ? { "Content-Type": contentType, "Content-Length": body.length } : {}),
    ...ATTACHMENT_SECURITY_HEADERS,
    ...headers
  });
  res.end(body ?? undefined);
}

function sendText(res, status, text, headers = {}) {
  if (res.headersSent) return;
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(text);
}

function buildSessionCookie(value, maxAgeSeconds, secure) {
  const parts = [`sid=${value}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAgeSeconds}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function sessionCookie(token, ttlMs, secure) {
  return buildSessionCookie(encodeURIComponent(token), Math.floor(ttlMs / 1000), secure);
}

function clearedSessionCookie(secure) {
  return buildSessionCookie("", 0, secure);
}

module.exports = {
  HttpError,
  ValidationError,
  SECURITY_HEADERS,
  ATTACHMENT_SECURITY_HEADERS,
  sendBinary,
  readBody,
  clientKey,
  parseCookies,
  sendJson,
  sendText,
  sessionCookie,
  clearedSessionCookie
};
