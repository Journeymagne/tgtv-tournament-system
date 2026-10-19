const crypto = require("node:crypto");
const { HttpError } = require("../http/io");
const { configuration } = require("./config");
const { equal, authorize } = require("./security");
const users = require("../db/repositories/users");
const access = require("../db/repositories/access");
const { loadUserFromRequest } = require("../api/auth");

const SESSION_SECONDS = 8 * 60 * 60;
const expired = () => new HttpError(401, "Сессия истекла. Закройте миниап и откройте его снова.");

// Telegram's HMAC includes every field except hash (including signature).
// Never trust initDataUnsafe, a username, or an ID supplied separately by a client.
function validateInitData(raw, token, now = Math.floor(Date.now() / 1000)) {
  if (typeof raw !== "string" || !raw || raw.length > 16384 || !token) throw expired();
  const data = new URLSearchParams(raw);
  const keys = [...data.keys()];
  if (new Set(keys).size !== keys.length) throw expired();
  const hash = data.get("hash");
  if (!/^[a-f0-9]{64}$/.test(hash || "")) throw expired();
  data.delete("hash");
  const check = [...data.keys()].sort().map(key => `${key}=${data.get(key)}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const expected = crypto.createHmac("sha256", secret).update(check).digest("hex");
  if (!equal(hash, expected)) throw expired();
  const date = Number(data.get("auth_date"));
  if (!Number.isSafeInteger(date) || date > now + 30 || now - date > 3600) throw expired();
  let person;
  try { person = JSON.parse(data.get("user")); } catch { throw expired(); }
  if (!Number.isSafeInteger(person?.id) || person.id <= 0 || person.is_bot) throw expired();
  return person;
}

function sign(value, token) {
  const key = crypto.createHmac("sha256", token).update("kt-companion:miniapp-session:v1").digest();
  return crypto.createHmac("sha256", key).update(value).digest("base64url");
}

function issueToken(link, token) {
  const issued = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ v: 1, uid: link.user_id, tid: String(link.telegram_id), lid: link.id, iat: issued, exp: issued + SESSION_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload, token)}`;
}

async function linkedUser(client, telegramId, identity) {
  const { rows: [link] } = await client.query("SELECT id,user_id,telegram_id FROM telegram_links WHERE telegram_id=$1", [telegramId]);
  if (!link || (identity && (link.id !== identity.lid || link.user_id !== identity.uid))) return null;
  const user = await access.hydrate(client, await users.findById(client, link.user_id));
  if (!user) return null;
  access.assertActive(user);
  return { user, link };
}

function checkOrigin(req) {
  const { siteOrigin } = require("../http/sites");
  const origin = siteOrigin(req) || process.env.SITE_URL || `${req.socket?.encrypted ? "https" : "http"}://${req.headers.host}`;
  if (req.headers.origin && req.headers.origin !== origin.replace(/\/+$/, "")) throw new HttpError(403, "Invalid origin");
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers["content-type"] || ""))) throw new HttpError(415, "Use application/json");
}

async function authenticate(ctx, write = false) {
  if (write && (!ctx.body || typeof ctx.body !== "object" || Array.isArray(ctx.body))) throw new HttpError(400, "Invalid request body");
  let user;
  const auth = ctx.req.headers.authorization;
  if (auth !== undefined) {
    const config = configuration();
    if (!config.enabled || !config.token || typeof auth !== "string" || auth.length > 2048 || !auth.startsWith("Bearer ")) throw expired();
    const parts = auth.slice(7).split(".");
    if (parts.length !== 2 || !equal(parts[1], sign(parts[0], config.token))) throw expired();
    let claims;
    try { claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { throw expired(); }
    const now = Math.floor(Date.now() / 1000);
    if (!claims || claims.v !== 1 || !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(claims.iat) || claims.iat > now + 30 || claims.exp <= now || claims.exp - claims.iat !== SESSION_SECONDS || !/^\d+$/.test(claims.tid)) throw expired();
    user = (await linkedUser(ctx.client, claims.tid, claims))?.user;
    if (!user) throw expired();
    if (write) checkOrigin(ctx.req);
  } else {
    user = await loadUserFromRequest(ctx.client, ctx.req);
    if (!user) throw new HttpError(401, "Войдите на сайт или откройте миниап через Telegram.");
    if (write) { checkOrigin(ctx.req); authorize({ ...ctx, user }); }
  }
  return { ...ctx, user };
}

module.exports = { validateInitData, issueToken, linkedUser, authenticate, checkOrigin, SESSION_SECONDS };
