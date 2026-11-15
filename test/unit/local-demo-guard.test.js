const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("demo seed refuses production before opening a database connection", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "../../scripts/seed-local-demo.js")], {
    cwd: path.join(__dirname, "../.."),
    env: { ...process.env, NODE_ENV: "production", DATABASE_URL: "postgres://unused:unused@127.0.0.1:55432/tgtv_local_demo" },
    encoding: "utf8",
    timeout: 5000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Demo seeding is disabled in production/);
  assert.doesNotMatch(result.stdout, /seeded|migration applied/);
});
