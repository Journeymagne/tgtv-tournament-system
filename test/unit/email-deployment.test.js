const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { update, main } = require("../../deploy/email-production-env.cjs");
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kt-email-env-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const env = path.join(directory, ".env"), fragment = path.join(directory, "mail.env");
  const original = "# Existing deployment\nDATABASE_URL=postgres://example:test@localhost/db\nPORT=3000\nOTHER=\"a#b = c\"\n";
  fs.writeFileSync(env, original + "EMAIL_PROVIDER=local\nexport EMAIL_PROVIDER=disabled\n");
  fs.writeFileSync(fragment, [
    "EMAIL_PROVIDER=disabled", "SITE_URL=https://ktcompanion.ru",
    "EMAIL_FROM=KT Companion <account@auth.ktcompanion.ru>", "EMAIL_REPLY_TO=",
    "RESEND_API_KEY=re_fake_test_key", "RESEND_WEBHOOK_SECRET=whsec_dGVzdA==",
    "EMAIL_OUTBOX_KEY=" + "ab".repeat(32), ""
  ].join("\n"));
  return { env, fragment, original };
}
test("deployment merges mail settings without changing database or other dotenv values", t => {
  const f = fixture(t);
  main(["configure", f.env, f.fragment, "disabled"]);
  const content = fs.readFileSync(f.env, "utf8"), values = parseEnv(content);
  assert.ok(content.startsWith(f.original));
  assert.equal((content.match(/^EMAIL_PROVIDER=/gm) || []).length, 1);
  assert.equal(values.EMAIL_PROVIDER, "disabled");
  assert.equal(values.OTHER, "a#b = c");
  assert.equal(values.COOKIE_SECURE, "true");
  assert.equal(values.TRUST_PROXY, "true");
  main(["provider", f.env, "resend"]);
  assert.equal(parseEnv(fs.readFileSync(f.env, "utf8")).EMAIL_PROVIDER, "resend");
});
test("invalid credentials are rejected before touching the production env", t => {
  const f = fixture(t), before = fs.readFileSync(f.env, "utf8");
  fs.writeFileSync(f.fragment, fs.readFileSync(f.fragment, "utf8").replace("re_fake_test_key", "invalid"));
  assert.throws(() => main(["configure", f.env, f.fragment, "resend"]), /API key format/);
  assert.equal(fs.readFileSync(f.env, "utf8"), before);
});
test("dotenv line injection cannot add unrelated environment variables", t => {
  const f = fixture(t), before = fs.readFileSync(f.env, "utf8");
  assert.throws(() => update(f.env, { EMAIL_FROM: "sender\nDATABASE_URL=other" }), /Multiline/);
  assert.equal(fs.readFileSync(f.env, "utf8"), before);
});
