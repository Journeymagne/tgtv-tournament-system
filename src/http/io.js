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
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new HttpError(413, "Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
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

function sessionCookie(token, ttlMs, secure) {
  const parts = [
    `sid=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.floor(ttlMs / 1000)}`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearedSessionCookie(secure) {
  const parts = ["sid=", "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

module.exports = {
  HttpError,
  ValidationError,
  SECURITY_HEADERS,
  readBody,
  parseCookies,
  sendJson,
  sendText,
  sessionCookie,
  clearedSessionCookie
};
