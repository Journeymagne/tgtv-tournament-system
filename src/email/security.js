const crypto = require("node:crypto");
const { ValidationError, HttpError, clientKey } = require("../http/io");
const { TRUST_PROXY } = require("../config");
const { configuration } = require("./config");

function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  const [local, domain, extra] = email.split("@");
  if (email.length > 254 || !local || local.length > 64 || !domain || extra !== undefined ||
      !/^[a-z0-9!#$%&'*+/=?^_\x60{|}~.-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9](?:[a-z0-9-]{0,57}[a-z0-9]))$/.test(domain)) {
    throw new ValidationError("Enter a valid email address");
  }
  return email;
}
function encrypt(payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", configuration().key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(b => b.toString("base64")).join(".");
}
function decrypt(value) {
  const [iv, tag, data] = value.split(".").map(p => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", configuration().key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
// An atomic shared budget. IP checks run outside the business transaction:
// rejecting a bad password or token must not roll back the rate limit.
async function spend(client, key, max, seconds) {
  const { rows } = await client.query(
    "INSERT INTO email_rate_limits(key,hits,expires_at) VALUES($1,1,NOW()+$2*INTERVAL '1 second') " +
    "ON CONFLICT(key) DO UPDATE SET " +
    "hits=CASE WHEN email_rate_limits.expires_at<=NOW() THEN 1 ELSE email_rate_limits.hits+1 END, " +
    "expires_at=CASE WHEN email_rate_limits.expires_at<=NOW() THEN EXCLUDED.expires_at ELSE email_rate_limits.expires_at END RETURNING hits",
    [hash(key), seconds]);
  return rows[0].hits <= max;
}
async function checkRequest(client, req) {
  const config = configuration();
  if (!config.enabled) throw new HttpError(503, "Email service is not enabled yet");
  if (req.headers.origin && req.headers.origin !== config.site) throw new HttpError(403, "Invalid request origin");
  if (!(await spend(client, "ip:" + clientKey(req, TRUST_PROXY), 90, 900))) {
    const err = new HttpError(429, "Too many requests. Please try again later");
    err.headers = { "Retry-After": "900" };
    throw err;
  }
}
function password(value) {
  const text = String(value || "");
  if (text.length < 6 || text.length > 256) throw new ValidationError("Password must contain 6 to 256 characters");
  return text;
}
function verifyWebhook(raw, headers) {
  const secret = configuration().webhookSecret;
  if (!secret) throw new HttpError(503, "Email webhook is not configured");
  const id = headers["svix-id"], timestamp = headers["svix-timestamp"], signature = headers["svix-signature"];
  if (typeof id !== "string" || id.length > 256 || !/^\d+$/.test(timestamp || "") ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || typeof signature !== "string") {
    throw new HttpError(401, "Invalid webhook signature");
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(id + "." + timestamp + ".").update(raw).digest();
  const valid = signature.split(" ").some(part => {
    const [version, encoded] = part.split(",");
    if (version !== "v1" || !encoded) return false;
    const received = Buffer.from(encoded, "base64");
    return received.length === expected.length && crypto.timingSafeEqual(expected, received);
  });
  if (!valid) throw new HttpError(401, "Invalid webhook signature");
  return id;
}
module.exports = { hash, normalizeEmail, encrypt, decrypt, spend, checkRequest, password, verifyWebhook };
