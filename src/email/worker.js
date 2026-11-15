const fs = require("node:fs/promises");
const path = require("node:path");
const { configuration } = require("./config");
const { decrypt } = require("./security");
const { withClient, withTransaction } = require("../db/pool");

async function claim() {
  return withTransaction(async client => {
    await client.query(
      "UPDATE email_outbox o SET state='cancelled',payload=NULL,locked_until=NULL WHERE state IN ('pending','processing') AND (" +
      "expires_at<=NOW() OR first_attempt_at<NOW()-INTERVAL '23 hours' OR " +
      "EXISTS(SELECT 1 FROM email_tokens t WHERE t.token_hash=o.token_hash AND (t.used_at IS NOT NULL OR t.expires_at<=NOW())) OR " +
      "EXISTS(SELECT 1 FROM email_suppressions s WHERE s.recipient_hash=o.recipient_hash))");
    const { rows } = await client.query(
      "WITH candidate AS (SELECT id FROM email_outbox WHERE payload IS NOT NULL AND next_attempt_at<=NOW() AND " +
      "(state='pending' OR (state='processing' AND locked_until<NOW())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) " +
      "UPDATE email_outbox SET state='processing',attempts=attempts+1,locked_until=NOW()+INTERVAL '60 seconds'," +
      "first_attempt_at=COALESCE(first_attempt_at,NOW()) WHERE id IN(SELECT id FROM candidate) RETURNING *");
    return rows[0];
  });
}
async function deliver(job) {
  const config = configuration();
  const payload = decrypt(job.payload);
  if (config.provider === "local") {
    await fs.mkdir(config.captureDir, { recursive: true });
    // Deliberately private, ignored local artifacts; no public preview API.
    try {
      await fs.writeFile(path.join(config.captureDir, job.id + ".json"), JSON.stringify(payload, null, 2), { flag: "wx", mode: 0o600 });
    } catch (err) { if (err.code !== "EEXIST") throw err; }
    return { id: "local-" + job.id, local: true };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json", "Idempotency-Key": "kt-mail/" + job.id },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const err = Error("resend_http_" + response.status);
    err.retryable = [408, 409, 429].includes(response.status) || response.status >= 500;
    throw err;
  }
  const result = await response.json();
  if (typeof result.id !== "string") throw Error("resend_missing_id");
  return result;
}
async function tick() {
  const job = await claim();
  if (!job) return;
  try {
    const delivered = await deliver(job);
    await withClient(client => client.query(
      "UPDATE email_outbox SET state=$2,provider_id=$3,sent_at=NOW(),payload=NULL,locked_until=NULL,last_error=NULL " +
      "WHERE id=$1 AND state='processing' AND attempts=$4",
      [job.id, delivered.local ? "local" : "sent", delivered.id, job.attempts]));
  } catch (err) {
    const retry = err.retryable !== false && job.attempts < 9;
    const code = /^resend_http_\d{3}$/.test(err.message) ? err.message : "delivery_error";
    await withClient(client => client.query(
      "UPDATE email_outbox SET state=$2,last_error=$3,locked_until=NULL,next_attempt_at=NOW()+$4*INTERVAL '1 second'," +
      "payload=CASE WHEN $2='failed' THEN NULL ELSE payload END WHERE id=$1 AND state='processing' AND attempts=$5",
      [job.id, retry ? "pending" : "failed", code, Math.min(1800, 15 * 2 ** job.attempts), job.attempts]));
  }
}
async function cleanup() {
  await withTransaction(async client => {
    await client.query("DELETE FROM email_rate_limits WHERE expires_at<NOW()-INTERVAL '1 day'");
    await client.query("DELETE FROM email_outbox WHERE created_at<NOW()-INTERVAL '30 days'");
    await client.query("DELETE FROM email_tokens WHERE expires_at<NOW()-INTERVAL '2 days'");
    await client.query("DELETE FROM email_webhook_events WHERE received_at<NOW()-INTERVAL '30 days'");
  });
}
function startWorker() {
  if (!configuration().enabled) return async () => {};
  let stopped = false, timer, active = Promise.resolve(), lastCleanup = 0;
  const run = () => {
    active = (async () => {
      try {
        if (Date.now() - lastCleanup > 3600000) { await cleanup(); lastCleanup = Date.now(); }
        await tick();
      } catch {
        // Database/provider diagnostics must never include payloads or tokens.
        console.error(JSON.stringify({ level: "error", msg: "email worker failed" }));
      }
      if (!stopped) { timer = setTimeout(run, 2000); timer.unref(); }
    })();
  };
  run();
  return async () => { stopped = true; clearTimeout(timer); await active; };
}
module.exports = { startWorker, tick };
