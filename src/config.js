const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

const ENV_PATH = path.join(ROOT, ".env");
if (fs.existsSync(ENV_PATH)) {
  process.loadEnvFile(ENV_PATH);
}

function positiveIntegerEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 65535 ? number : fallback;
}

function booleanEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes"].includes(String(value).toLowerCase());
}

function requireDatabaseUrl(value = process.env.DATABASE_URL) {
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Start PostgreSQL with `docker compose up -d` " +
        "and set DATABASE_URL in .env. The JSON storage fallback has been removed."
    );
  }
  return value;
}

module.exports = {
  ROOT,
  PUBLIC_DIR,
  PORT: positiveIntegerEnv("PORT", 3000),
  HOST: process.env.HOST || "127.0.0.1",
  DATABASE_URL: process.env.DATABASE_URL || "",
  PGSSL: booleanEnv("PGSSL", false) || booleanEnv("DATABASE_SSL", false),
  COOKIE_SECURE: booleanEnv("COOKIE_SECURE", process.env.NODE_ENV === "production"),
  SESSION_TTL_MS: 1000 * 60 * 60 * 24 * 14,
  INITIAL_RATING: 1000,
  MAX_REQUEST_BYTES: 2 * 1024 * 1024,
  MAX_AVATAR_DATA_URL_LENGTH: 1024 * 1024,
  // max: 10 was one shared bucket for the whole site once every request
  // reports the same address (see TRUST_PROXY below) -- a tournament venue
  // on one NAT/IP is the app's main use case, and only *failed* attempts
  // consume this budget (src/http/router.js), so 30 still stops a guessing
  // attack while leaving room for a room full of real, occasionally-mistyped
  // sign-ins (Blocker 1).
  LOGIN_RATE_LIMIT: { windowMs: 15 * 60 * 1000, max: 30 },
  // Off by default: req.socket.remoteAddress is the only address the app can
  // trust without any configuration, because a bare Node http server sees
  // real client sockets. Behind the reverse proxy this app actually runs
  // under in production (update_tgtv-ts.sh), every remoteAddress is instead
  // the proxy's own address, collapsing the rate limiter to one shared
  // bucket for the entire site (Blocker 1). Turning this on tells the router
  // to read the client address from X-Forwarded-For instead -- see
  // clientKey() in src/http/router.js for exactly which entry it trusts.
  // This must stay off for any deployment that ISN'T behind exactly one
  // trusted proxy: with it on but no real proxy in front, a client's own
  // X-Forwarded-For header would be trusted outright, and spoofing it is
  // one curl flag away.
  TRUST_PROXY: booleanEnv("TRUST_PROXY", false),
  requireDatabaseUrl
};
