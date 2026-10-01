const { HOST, ROOT } = require("../config");
const path = require("node:path");

function configuration() {
  const provider = process.env.EMAIL_PROVIDER || "disabled";
  if (!["disabled", "local", "resend"].includes(provider)) throw Error("Invalid EMAIL_PROVIDER");
  if (provider === "disabled") return { provider, enabled: false };
  const site = new URL(process.env.SITE_URL || "");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(site.hostname);
  if (site.username || site.password || site.search || site.hash || site.pathname !== "/") {
    throw Error("SITE_URL must be a site origin without credentials, path, query or fragment");
  }
  if (site.protocol !== "https:" && !(site.protocol === "http:" && loopback)) throw Error("SITE_URL requires HTTPS");
  if (provider === "local" && (process.env.NODE_ENV === "production" || !loopback || !["127.0.0.1", "::1", "localhost"].includes(HOST))) {
    throw Error("Local email capture requires a loopback development server");
  }
  const keyValue = process.env.EMAIL_OUTBOX_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(keyValue)) throw Error("EMAIL_OUTBOX_KEY must contain 64 hex characters (32 random bytes)");
  const from = process.env.EMAIL_FROM || (provider === "local" ? "KT Companion <account@auth.example.test>" : "");
  if (!from || /[\r\n]/.test(from)) throw Error("EMAIL_FROM is required");
  const replyTo = process.env.EMAIL_REPLY_TO || "";
  if (/[\r\n]/.test(replyTo)) throw Error("Invalid EMAIL_REPLY_TO");
  if (provider === "resend" && !process.env.RESEND_API_KEY) throw Error("RESEND_API_KEY is required");
  if (provider === "resend" && !/^whsec_[A-Za-z0-9+/=]+$/.test(process.env.RESEND_WEBHOOK_SECRET || "")) throw Error("RESEND_WEBHOOK_SECRET is required");
  return {
    enabled: true, provider, site: site.origin, key: Buffer.from(keyValue, "hex"), from, replyTo,
    apiKey: process.env.RESEND_API_KEY, webhookSecret: process.env.RESEND_WEBHOOK_SECRET || "",
    captureDir: path.join(ROOT, "work", "email")
  };
}
module.exports = { configuration };
