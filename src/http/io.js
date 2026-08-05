const { MAX_REQUEST_BYTES } = require("../config");

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
  "Referrer-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "img-src 'self' data:",
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
    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new HttpError(413, "Request body is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
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

function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...SECURITY_HEADERS,
    ...headers
  });
  res.end(payload);
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
  readBody,
  clientKey,
  parseCookies,
  sendJson,
  sendText,
  sessionCookie,
  clearedSessionCookie
};
