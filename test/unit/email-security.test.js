const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
Object.assign(process.env, {
  NODE_ENV: "test", HOST: "127.0.0.1", SITE_URL: "http://127.0.0.1:4319",
  EMAIL_PROVIDER: "local", EMAIL_OUTBOX_KEY: crypto.randomBytes(32).toString("hex"),
  RESEND_WEBHOOK_SECRET: "whsec_" + crypto.randomBytes(32).toString("base64")
});
const { normalizeEmail, encrypt, decrypt, verifyWebhook } = require("../../src/email/security");
const { message } = require("../../src/email/templates");

test("email normalization preserves aliases and rejects header injection", () => {
  assert.equal(normalizeEmail(" Player.Tag+KT@Example.COM "), "player.tag+kt@example.com");
  for (const value of ["x@y", "a..b@example.com", ".a@example.com", "a@-bad.example", "a@example.com\r\nBcc:evil@example.com"]) {
    assert.throws(() => normalizeEmail(value), err => err.status === 400);
  }
});
test("encrypted queue hides token and rejects tampered authentication tags", () => {
  const payload = { text: "https://example.com/#reset=" + "f".repeat(64) };
  const a = encrypt(payload), b = encrypt(payload);
  assert.notEqual(a, b);
  assert.ok(!a.includes("f".repeat(64)));
  assert.deepEqual(decrypt(a), payload);
  const parts = a.split(".");
  const tag = Buffer.from(parts[1], "base64"); tag[0] ^= 1; parts[1] = tag.toString("base64");
  assert.throws(() => decrypt(parts.join(".")));
});
function signed(raw, seconds = Math.floor(Date.now() / 1000)) {
  const headers = { "svix-id": "msg_local_example", "svix-timestamp": String(seconds) };
  const key = Buffer.from(process.env.RESEND_WEBHOOK_SECRET.slice(6), "base64");
  headers["svix-signature"] = "v1," + crypto.createHmac("sha256", key)
    .update(headers["svix-id"] + "." + seconds + ".").update(raw).digest("base64");
  return headers;
}
test("webhook accepts signed raw bytes, rejects tampering and expired timestamps", () => {
  const raw = Buffer.from('{"type": "email.delivered", "data": {"email_id": "demo"}}');
  const headers = signed(raw);
  assert.equal(verifyWebhook(raw, headers), headers["svix-id"]);
  assert.throws(() => verifyWebhook(Buffer.from(raw.toString().replace("delivered", "bounced")), headers), err => err.status === 401);
  assert.throws(() => verifyWebhook(raw, signed(raw, Math.floor(Date.now() / 1000) - 600)), err => err.status === 401);
  assert.throws(() => verifyWebhook(raw, {}), err => err.status === 401);
});
test("email HTML escapes account-controlled names and has readable text", () => {
  const result = message("reset", { name: '<img src=x onerror="alert(1)">', link: "https://example.com/account-email.html#reset=abc", locale: "en" });
  assert.ok(!result.html.includes("<img src=x"));
  assert.match(result.html, /<img src="https:\/\/example\.com\/logo\.png"/);
  assert.ok(result.html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.match(result.text, /30 minutes/);
  assert.match(result.text, /https:\/\/example.com\/account-email.html#reset=abc/);
});
