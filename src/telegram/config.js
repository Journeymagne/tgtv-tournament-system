const { ROOT, HOST } = require("../config");
const path = require("node:path");

function adminOnly() {
  const value = process.env.TELEGRAM_ADMIN_ONLY || 'false';
  if (!['true', 'false'].includes(value)) throw Error('TELEGRAM_ADMIN_ONLY must be true or false');
  return value === 'true';
}

function configuration() {
  const restricted = adminOnly();
  const tunnelPort = Number(process.env.TELEGRAM_TUNNEL_PORT || 0);
  if (!Number.isInteger(tunnelPort) || tunnelPort < 0 || tunnelPort > 65535) throw Error('Invalid TELEGRAM_TUNNEL_PORT');
  const mode = process.env.TELEGRAM_MODE || "disabled";
  if (!["disabled", "local", "polling", "webhook"].includes(mode)) throw Error("Invalid TELEGRAM_MODE");
  if (mode === "disabled") return { enabled: false, mode, adminOnly: restricted, tunnelPort };
  const site = new URL(process.env.SITE_URL || "");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(site.hostname);
  if (site.username || site.password || site.search || site.hash || site.pathname !== "/" ||
      (site.protocol !== "https:" && !(site.protocol === "http:" && loopback))) throw Error("Telegram requires a valid SITE_URL origin (HTTPS except local development)");
  if (mode === "local" && (process.env.NODE_ENV === "production" || !loopback || !["127.0.0.1", "localhost", "::1"].includes(HOST))) throw Error("Local Telegram capture requires a loopback development server");
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const username = process.env.TELEGRAM_BOT_USERNAME || "";
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) throw Error("TELEGRAM_BOT_USERNAME is required without @");
  if (mode !== "local" && !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw Error("TELEGRAM_BOT_TOKEN is required");
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (mode === "webhook" && (!/^[A-Za-z0-9_-]{32,256}$/.test(webhookSecret) || site.protocol !== "https:")) throw Error("Webhook mode requires HTTPS and TELEGRAM_WEBHOOK_SECRET (32-256 characters)");
  let miniAppUrl = null;
  if (process.env.TELEGRAM_MINI_APP_URL) {
    const app = new URL(process.env.TELEGRAM_MINI_APP_URL);
    if (app.origin !== site.origin || app.protocol !== "https:" || loopback || app.username || app.password || app.search || app.hash || !["/miniapp", "/miniapp/"].includes(app.pathname)) throw Error("TELEGRAM_MINI_APP_URL must be the public HTTPS SITE_URL/miniapp address");
    miniAppUrl = app.href;
  }
  return { enabled: true, mode, adminOnly: restricted, tunnelPort, site: site.origin, username, token, webhookSecret, miniAppUrl, captureDir: path.join(ROOT, "work", "telegram") };
}
module.exports = { configuration, adminOnly };
