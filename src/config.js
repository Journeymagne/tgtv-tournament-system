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
  LOGIN_RATE_LIMIT: { windowMs: 15 * 60 * 1000, max: 10 },
  requireDatabaseUrl
};
