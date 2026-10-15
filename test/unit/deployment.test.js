const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { migrationFingerprint, healthOrigin, healthHeaders, ready } = require("../../scripts/deploy-release");
const { dependencyFingerprint, dependenciesCurrent, recordDependencies } = require("../../scripts/dependency-state");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tgtv-deploy-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("source edits and release numbers reuse dependencies; lock/runtime changes do not", t => {
  const directory = temporary(t);
  const pkg = { name: "fixture", version: "1", dependencies: { example: "1.0.0" } };
  const lock = { version: "1", packages: { "": { version: "1" }, "node_modules/example": { version: "1.0.0" } } };
  const write = () => {
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(pkg));
    fs.writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify(lock));
  };
  write();
  const original = dependencyFingerprint(directory, true, "10");
  fs.writeFileSync(path.join(directory, "source.js"), "changed code");
  pkg.version = lock.version = lock.packages[""].version = "2";
  write();
  assert.equal(dependencyFingerprint(directory, true, "10"), original);
  assert.notEqual(dependencyFingerprint(directory, true, "11"), original);
  assert.notEqual(dependencyFingerprint(directory, false, "10"), original);
  lock.packages["node_modules/example"].version = "1.0.1";
  write();
  assert.notEqual(dependencyFingerprint(directory, true, "10"), original);
});

test("dependency stamps reject missing packages, changed versions and damaged hidden lockfiles", t => {
  const directory = temporary(t);
  const modules = path.join(directory, "node_modules");
  const packageFile = path.join(modules, "example", "package.json");
  fs.mkdirSync(path.dirname(packageFile), { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ dependencies: { example: "1" } }));
  fs.writeFileSync(packageFile, JSON.stringify({ version: "1" }));
  fs.writeFileSync(path.join(modules, ".package-lock.json"), "original");
  recordDependencies(directory, "key", true);
  assert.equal(dependenciesCurrent(directory, "key"), true);
  assert.equal(dependenciesCurrent(directory, "other-key"), false);
  fs.writeFileSync(packageFile, JSON.stringify({ version: "2" }));
  assert.equal(dependenciesCurrent(directory, "key"), false);
  fs.unlinkSync(packageFile);
  assert.equal(dependenciesCurrent(directory, "key"), false);
  fs.writeFileSync(packageFile, JSON.stringify({ version: "1" }));
  fs.writeFileSync(path.join(modules, ".package-lock.json"), "damaged");
  assert.equal(dependenciesCurrent(directory, "key"), false);
});

test("migration compatibility detects an edited migration, added migration and changed runner", t => {
  const directory = temporary(t);
  const migrations = path.join(directory, "src/db/migrations");
  fs.mkdirSync(migrations, { recursive: true });
  fs.writeFileSync(path.join(directory, "src/db/migrate.js"), "runner");
  fs.writeFileSync(path.join(migrations, "001.js"), "original");
  const original = migrationFingerprint(directory);
  fs.writeFileSync(path.join(directory, "server.js"), "unrelated server edit");
  assert.equal(migrationFingerprint(directory), original);
  fs.writeFileSync(path.join(migrations, "001.js"), "edited");
  assert.notEqual(migrationFingerprint(directory), original);
  fs.writeFileSync(path.join(migrations, "001.js"), "original");
  fs.writeFileSync(path.join(migrations, "002.js"), "new migration");
  assert.notEqual(migrationFingerprint(directory), original);
  fs.unlinkSync(path.join(migrations, "002.js"));
  fs.writeFileSync(path.join(directory, "src/db/migrate.js"), "changed runner");
  assert.notEqual(migrationFingerprint(directory), original);
});

async function listener(t, alter = () => {}) {
  const seen = new Set();
  const server = http.createServer((req, res) => {
    seen.add(req.url);
    if (req.headers.host !== "companion.example") {
      res.writeHead(302, { Location: "https://companion.example/" });
      res.end();
      return;
    }
    const response = {
      status: 200, release: "candidate",
      body: req.url === "/api/me" ? '{"user":null}' : req.url === "/combat/api/health" ?
        '{"status":"ok","buildReady":true}' : "<!doctype html><html><body>page</body></html>"
    };
    alter(req.url, response);
    res.writeHead(response.status, { "X-KT-Release": response.release });
    res.end(response.body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { origin: `http://127.0.0.1:${server.address().port}`, seen };
}

test("readiness checks all four local routes using the canonical host", async t => {
  const { origin, seen } = await listener(t);
  await ready(origin, "candidate", { headers: healthHeaders({ COMPANION_ORIGIN: "https://companion.example" }) });
  assert.deepEqual([...seen], ["/", "/api/me", "/combat", "/combat/api/health"]);
  assert.equal(healthOrigin({ HOST: "0.0.0.0", PORT: "3001" }), "http://127.0.0.1:3001");
  assert.equal(healthOrigin({ HOST: "::", PORT: "3001" }), "http://[::1]:3001");
});

for (const [description, alter] of [
  ["old process responding on the same port", (_route, response) => { response.release = "old"; }],
  ["database API failure", (route, response) => { if (route === "/api/me") response.status = 500; }],
  ["HTML served in place of API JSON", (route, response) => { if (route === "/api/me") response.body = "<html>fallback</html>"; }],
  ["missing calculator build", (route, response) => { if (route === "/combat/api/health") response.body = '{"status":"ok","buildReady":false}'; }]
]) {
  test(`readiness rejects ${description}`, async t => {
    const { origin } = await listener(t, alter);
    await assert.rejects(ready(origin, "candidate", { timeout: 150, headers: { Host: "companion.example" } }), /did not become healthy/);
  });
}
