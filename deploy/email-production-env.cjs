"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { spawnSync } = require("node:child_process");
const MAIL_KEYS = ["EMAIL_PROVIDER", "SITE_URL", "EMAIL_FROM", "EMAIL_REPLY_TO",
  "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_OUTBOX_KEY"];
function read(file) { return parseEnv(fs.readFileSync(file, "utf8")); }
function update(file, values) {
  let content = fs.readFileSync(file, "utf8");
  for (const [key, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw Error("Multiline value rejected for " + key);
    // Replace only our single-line settings. Keep all other dotenv bytes.
    const line = new RegExp("^[ \\t]*(?:export[ \\t]+)?" + key + "[ \\t]*=.*(?:\\r?\\n|$)", "gm");
    content = content.replace(line, "");
  }
  content = content.trimEnd() + "\n\n" +
    Object.entries(values).map(([key, value]) => key + "=" + value).join("\n") + "\n";
  const temporary = file + ".email-next";
  fs.writeFileSync(temporary, content, { mode: 0o600, flag: "wx" });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}
function main([command, envFile, third, fourth]) {
  if (command === "configure") {
    const fragment = read(third), provider = fourth;
    if (!["disabled", "resend"].includes(provider)) throw Error("Invalid provider");
    for (const key of MAIL_KEYS) if (!(key in fragment)) throw Error("Missing setting " + key);
    if (fragment.SITE_URL !== "https://ktcompanion.ru") throw Error("Unexpected public origin");
    if (fragment.EMAIL_FROM !== "KT Companion <account@auth.ktcompanion.ru>") throw Error("Unexpected sender");
    if (!/^re_[A-Za-z0-9_-]+$/.test(fragment.RESEND_API_KEY)) throw Error("Invalid API key format");
    if (!/^whsec_[A-Za-z0-9+/=]+$/.test(fragment.RESEND_WEBHOOK_SECRET)) throw Error("Invalid webhook key format");
    if (!/^[a-f0-9]{64}$/i.test(fragment.EMAIL_OUTBOX_KEY)) throw Error("Invalid outbox key format");
    const values = Object.fromEntries(MAIL_KEYS.map(key => [key, fragment[key]]));
    update(envFile, { ...values, EMAIL_PROVIDER: provider, COOKIE_SECURE: "true", TRUST_PROXY: "true" });
  } else if (command === "provider") {
    if (!["disabled", "resend"].includes(third)) throw Error("Invalid provider");
    update(envFile, { EMAIL_PROVIDER: third });
  } else if (command === "restart") {
    const values = read(envFile);
    const result = spawnSync("pm2", ["restart", third, "--update-env"], {
      env: { ...process.env, ...values, NODE_ENV: "production",
        EMAIL_PROVIDER: values.EMAIL_PROVIDER || "disabled" }, stdio: "inherit"
    });
    if (result.error || result.status !== 0) throw Error("PM2 restart failed");
  } else if (command === "preflight") {
    const result = spawnSync("pm2", ["jlist"], { encoding: "utf8" });
    if (result.error || result.status !== 0) throw Error("Cannot inspect PM2");
    const apps = JSON.parse(result.stdout).filter(app => app.name === third);
    if (apps.length !== 1) throw Error("Expected exactly one production application");
    const runtime = apps[0].pm2_env, values = read(envFile);
    if (path.resolve(runtime.pm_exec_path) !== "/app/tgtv-ts/server.js" ||
        path.resolve(runtime.pm_cwd) !== "/app/tgtv-ts") throw Error("Unexpected PM2 application path");
    if (runtime.DATABASE_URL && runtime.DATABASE_URL !== values.DATABASE_URL) {
      throw Error("PM2 database differs from the canonical env file");
    }
    const db = new URL(values.DATABASE_URL);
    if (!["localhost", "127.0.0.1"].includes(db.hostname) || (db.port && db.port !== "5432") ||
        db.pathname !== "/tgtv_tournament" || db.username !== "tgtv") throw Error("Unexpected production database");
    if (values.PORT && values.PORT !== "3000") throw Error("Unexpected application port");
    if (values.HOST && values.HOST !== "127.0.0.1") throw Error("Unexpected application bind address");
    console.log("Production paths, PM2 process and database match the deployment plan");
  } else throw Error("Unknown email deployment command");
}
if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { update, main };
