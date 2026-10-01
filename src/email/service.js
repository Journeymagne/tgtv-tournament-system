const crypto = require("node:crypto");
const { configuration } = require("./config");
const { hash, encrypt, spend } = require("./security");
const { message } = require("./templates");
const access = require("../db/repositories/access");

async function account(client, userId) {
  const { rows } = await client.query("SELECT * FROM user_email_accounts WHERE user_id=$1", [userId]);
  return rows[0] || null;
}
async function summary(client, userId) {
  const data = await account(client, userId);
  return { enabled: configuration().enabled, email: data?.email || null,
    verifiedAt: data?.verified_at || null, pendingEmail: data?.pending_email || null };
}
async function queue(client, user, to, kind, options = {}) {
  const config = configuration();
  if (!config.enabled || !to) return;
  const id = crypto.randomUUID();
  const payload = {
    from: config.from, to: [to], ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    ...message(kind, { name: user.name, locale: options.locale || "ru", link: options.link })
  };
  await client.query(
    "INSERT INTO email_outbox(id,user_id,kind,recipient_hash,payload,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [id, user.id, kind, hash(to), encrypt(payload), options.tokenHash || null,
      options.expires || new Date(Date.now() + 23 * 3600000)]);
}
async function invalidate(client, userId, purpose) {
  const { rows } = await client.query(
    "UPDATE email_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL AND ($2::text IS NULL OR purpose=$2) RETURNING token_hash",
    [userId, purpose || null]);
  if (rows.length) await client.query(
    "UPDATE email_outbox SET state='cancelled',payload=NULL,locked_until=NULL WHERE token_hash=ANY($1::text[]) AND state IN ('pending','processing')",
    [rows.map(r => r.token_hash)]);
}
async function issue(client, user, email, purpose, locale) {
  // Both successful and ignored requests spend recipient budgets. Unverified
  // signups cannot reserve an address, or send unlimited mail to someone else.
  const minute = await spend(client, "recipient-minute:" + email, 1, 60);
  const hour = await spend(client, "recipient-hour:" + email, 5, 3600);
  if (!minute || !hour) return false;
  await invalidate(client, user.id, purpose);
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + (purpose === "reset" ? 30 * 60000 : 24 * 3600000));
  const tokenHash = hash(token);
  await client.query(
    "INSERT INTO email_tokens(token_hash,user_id,purpose,email,expires_at) VALUES($1,$2,$3,$4,$5)",
    [tokenHash, user.id, purpose, email, expires]);
  const link = configuration().site + "/account-email.html#" + purpose + "=" + token;
  await queue(client, user, email, purpose, { link, tokenHash, expires, locale });
  return true;
}
async function beginRegistration(client, user, email, locale) {
  if (!configuration().enabled) return;
  await client.query("INSERT INTO user_email_accounts(user_id,pending_email,locale) VALUES($1,$2,$3)",
    [user.id, email, locale === "en" ? "en" : "ru"]);
  // Address conflicts are resolved at confirmation, so registration does not
  // disclose whether an email belongs to another account.
  await issue(client, user, email, "verify", locale);
}
async function passwordChanged(client, user, keepSession) {
  await access.audit(client,user,"account_password_changed","user",user.id,null,{ otherSessionsRevoked:true });
  await client.query("DELETE FROM sessions WHERE user_id=$1 AND ($2::text IS NULL OR token<>$2)", [user.id, keepSession || null]);
  await invalidate(client, user.id);
  await client.query("UPDATE user_email_accounts SET pending_email=NULL,updated_at=NOW() WHERE user_id=$1", [user.id]);
  const data = await account(client, user.id);
  if (data?.email) await queue(client, user, data.email, "password_changed", { locale: data.locale });
}
module.exports = { account, summary, queue, invalidate, issue, beginRegistration, passwordChanged };
