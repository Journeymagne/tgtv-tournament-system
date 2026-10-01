const { HttpError, ValidationError, sessionToken, clearedSessionCookie } = require("../http/io");
const { COOKIE_SECURE } = require("../config");
const { configuration } = require("../email/config");
const { normalizeEmail, hash, spend, password, verifyWebhook } = require("../email/security");
const mail = require("../email/service");
const users = require("../db/repositories/users");
const access = require("../db/repositories/access");
const { verifyPassword, hashPassword } = require("../domain/passwords");

const generic = () => ({ status: 202, body: { ok: true }, headers: { "Cache-Control": "no-store" } });
const invalid = () => new ValidationError("This link is invalid or expired. Request a new email");
async function lockedUser(client, id, req) {
  const user = (await users.lockByIds(client, [id]))[0];
  if (!user) throw new HttpError(401, "You need to sign in");
  access.assertActive(await access.hydrate(client, user));
  // Recheck a session after waiting for the user lock. A reset in another
  // request may have revoked the session that the router initially loaded.
  if (req) {
    const { rowCount } = await client.query("SELECT 1 FROM sessions WHERE user_id=$1 AND token=$2 AND expires_at>NOW()", [id, sessionToken(req)]);
    if (!rowCount) throw new HttpError(401, "You need to sign in");
  }
  return user;
}
function config() {
  return { body: { enabled: configuration().enabled }, headers: { "Cache-Control": "no-store" } };
}
async function status({ client, user }) {
  return { body: await mail.summary(client, user.id), headers: { "Cache-Control": "no-store" } };
}
async function change({ client, user, body, req }) {
  const email = normalizeEmail(body.email);
  user = await lockedUser(client, user.id, req);
  if (!(await verifyPassword(String(body.currentPassword || ""), user.passwordHash))) throw new HttpError(401, "Current password is incorrect");
  const data = await mail.account(client, user.id);
  if (data?.email === email) throw new ValidationError("This email address is already confirmed");
  if (!(await spend(client, "change:" + user.id, 5, 3600))) throw new HttpError(429, "Too many requests. Please try again later");
  const locale = body.locale === "en" ? "en" : "ru";
  await mail.invalidate(client, user.id, "verify");
  await client.query(
    "INSERT INTO user_email_accounts(user_id,pending_email,locale) VALUES($1,$2,$3) " +
    "ON CONFLICT(user_id) DO UPDATE SET pending_email=$2,locale=$3,updated_at=NOW()", [user.id, email, locale]);
  await mail.issue(client, user, email, "verify", locale);
  if (data?.email) await mail.queue(client, user, data.email, "email_change_requested", { locale });
  return generic();
}
async function cancel({ client, user, req }) {
  await lockedUser(client, user.id, req);
  await mail.invalidate(client, user.id, "verify");
  await client.query("UPDATE user_email_accounts SET pending_email=NULL,updated_at=NOW() WHERE user_id=$1", [user.id]);
  return { ok: true };
}
async function resend({ client, user, req }) {
  user = await lockedUser(client, user.id, req);
  const data = await mail.account(client, user.id);
  if (data?.pending_email) await mail.issue(client, user, data.pending_email, "verify", data.locale);
  return generic();
}
async function forgot({ client, body }) {
  const email = normalizeEmail(body.email);
  // Spend the same budget for missing and existing accounts, and return the
  // same status/body. Only verified email addresses enable recovery.
  if (!(await spend(client, "forgot:" + email, 5, 3600))) return generic();
  const { rows } = await client.query("SELECT user_id FROM user_email_accounts WHERE email=$1 AND verified_at IS NOT NULL", [email]);
  if (!rows[0]) return generic();
  let user;
  try { user = await lockedUser(client, rows[0].user_id); }
  catch (err) { if ([401, 403].includes(err.status)) return generic(); throw err; }
  const data = await mail.account(client, user.id);
  if (data?.email === email) await mail.issue(client, user, email, "reset", data.locale);
  return generic();
}
async function tokenContext(client, raw, purpose) {
  if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw)) throw invalid();
  const tokenHash = hash(raw);
  const found = await client.query("SELECT user_id FROM email_tokens WHERE token_hash=$1", [tokenHash]);
  if (!found.rows[0]) throw invalid();
  const user = await lockedUser(client, found.rows[0].user_id);
  const { rows } = await client.query(
    "SELECT * FROM email_tokens WHERE token_hash=$1 AND purpose=$2 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE", [tokenHash, purpose]);
  if (!rows[0]) throw invalid();
  const data = await mail.account(client, user.id);
  const expected = purpose === "verify" ? data?.pending_email : data?.email;
  if (rows[0].email !== expected) throw invalid();
  return { user, data, tokenHash };
}
async function confirm({ client, body }) {
  const { user, data } = await tokenContext(client, body.token, "verify");
  // Serialize competing confirmations, without reserving unverified addresses.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["email:" + data.pending_email]);
  const conflict = await client.query("SELECT 1 FROM user_email_accounts WHERE email=$1 AND user_id<>$2", [data.pending_email, user.id]);
  if (conflict.rowCount) throw invalid();
  await client.query("UPDATE user_email_accounts SET email=pending_email,pending_email=NULL,verified_at=NOW(),updated_at=NOW() WHERE user_id=$1", [user.id]);
  await mail.invalidate(client, user.id);
  await access.audit(client,user,"email_confirmed","user",user.id,null,{ changed:Boolean(data.email) });
  if (data.email) {
    await mail.queue(client, user, data.email, "email_changed", { locale: data.locale });
    await mail.queue(client, user, data.pending_email, "email_changed", { locale: data.locale });
    // Changing the recovery address ends existing sessions.
    await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
  }
  // Do not let a stale renewed cookie overwrite a cleared session cookie.
  return data.email ? { body: { ok: true }, headers: { "Set-Cookie": clearedSessionCookie(COOKIE_SECURE) } } : { ok: true };
}
async function reset({ client, body }) {
  const next = password(body.password);
  if (next !== body.confirmPassword) throw new ValidationError("Passwords do not match");
  const { user } = await tokenContext(client, body.token, "reset");
  await users.setPasswordHash(client, user.id, await hashPassword(next));
  await mail.passwordChanged(client, user);
  return { body: { ok: true }, headers: { "Set-Cookie": clearedSessionCookie(COOKIE_SECURE), "Cache-Control": "no-store" } };
}
async function webhook({ client, body, req }) {
  const eventId = verifyWebhook(body, req.headers);
  let event;
  try { event = JSON.parse(body.toString("utf8")); } catch { throw new ValidationError("Invalid webhook body"); }
  const allowed = ["email.sent", "email.delivered", "email.delivery_delayed", "email.failed", "email.bounced", "email.complained", "email.suppressed"];
  if (!allowed.includes(event?.type)) return { ok: true };
  const providerId = event.data?.email_id, occurred = new Date(event.created_at);
  if (typeof providerId !== "string" || providerId.length > 256 || !Number.isFinite(occurred.getTime())) throw new ValidationError("Invalid webhook event");
  const receipt = await client.query(
    "INSERT INTO email_webhook_events(event_id,provider_id,event_type,occurred_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [eventId, providerId, event.type, occurred]);
  if (receipt.rowCount && ["email.bounced", "email.complained", "email.suppressed"].includes(event.type)) {
    // Signed recipients let an event arriving before the send response still
    // suppress the mailbox. Never retain the raw webhook or plaintext address.
    for (const recipient of Array.isArray(event.data.to) ? event.data.to.slice(0, 50) : []) {
      let email;
      try { email = normalizeEmail(recipient); } catch { continue; }
      await client.query(
        "INSERT INTO email_suppressions(recipient_hash,reason) VALUES($1,$2) ON CONFLICT(recipient_hash) DO UPDATE SET reason=$2",
        [hash(email), event.type]);
    }
  }
  return { ok: true };
}
async function health({ client }) {
  const { rows } = await client.query("SELECT state,COUNT(*)::integer AS count,MIN(created_at) AS oldest FROM email_outbox GROUP BY state ORDER BY state");
  const events = await client.query("SELECT event_type,COUNT(*)::integer AS count FROM email_webhook_events GROUP BY event_type ORDER BY event_type");
  const failures = await client.query("SELECT id,kind,state,last_error,attempts,created_at FROM email_outbox WHERE state='failed' ORDER BY created_at DESC LIMIT 20");
  return { body: { provider: configuration().provider, queue: rows, events: events.rows, failures: failures.rows },
    headers: { "Cache-Control": "no-store" } };
}
module.exports = { config, status, change, cancel, resend, forgot, confirm, reset, webhook, health, lockedUser };
