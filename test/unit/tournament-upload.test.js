const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRouter } = require("../../src/http/router");
const routes = require("../../src/api/routes");
const { startApiServer, createClient } = require("../helpers/client");

async function upload(method, url, body, user = { id: 1, isAdmin: true }) {
  let handled = false;
  const router = createRouter(routes.map((route) => ({
    ...route,
    handler: ({ body: input }) => {
      handled = true;
      assert.deepEqual(input, body);
      return { saved: true };
    }
  })), {
    withClient: (fn) => fn(null),
    withTransaction: (fn) => fn(null),
    loadUser: async () => user
  });
  const server = await startApiServer(router);
  try {
    const client = createClient(server.baseUrl);
    const response = method === "POST" ? await client.post(url, body) : await client.patch(url, body);
    return { ...response, handled };
  } finally {
    await server.close();
  }
}

const rulesLink = `data:application/pdf;base64,${Buffer.alloc(2 * 1024 * 1024, 65).toString("base64")}`;

test("create and edit accept a 2 MiB PDF after Base64 encoding with tournament metadata", async () => {
  for (const [method, url] of [["POST", "/api/admin/tournaments"], ["PATCH", "/api/admin/tournaments/1"]]) {
    const response = await upload(method, url, { name: "Rules upload", description: "я".repeat(10000), rulesLink });
    assert.equal(response.status, 200);
    assert.equal(response.handled, true);
  }
});

test("upload allowance does not bypass authentication or administrator checks", async () => {
  for (const [user, status] of [[null, 401], [{ id: 2, isAdmin: false }, 403]]) {
    const response = await upload("PATCH", "/api/admin/tournaments/1", { rulesLink }, user);
    assert.equal(response.status, status);
    assert.equal(response.handled, false);
  }
});

test("oversized requests return JSON 413 over HTTP without a socket reset or executing handlers", async () => {
  for (const [method, url, size] of [
    ["POST", "/api/admin/tournaments", 5 * 1024 * 1024],
    ["PATCH", "/api/admin/tournaments/1", 5 * 1024 * 1024],
    ["PATCH", "/api/me", 2 * 1024 * 1024]
  ]) {
    const response = await upload(method, url, { value: "a".repeat(size) });
    assert.equal(response.status, 413);
    assert.deepEqual(response.body, { error: "Request body is too large" });
    assert.equal(response.handled, false);
  }
});

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const apiSource = appSource.match(/async function api\([^\n]*\) \{[\s\S]*?\r?\n\}/)[0];

test("browser explains both Nginx HTML and application JSON upload rejections", async () => {
  for (const json of [async () => { throw new SyntaxError("HTML response"); }, async () => ({ error: "Request body is too large" })]) {
    const api = new Function("fetch", "t", `${apiSource}; return api;`)(
      async () => ({ ok: false, status: 413, json }), (key) => key
    );
    await assert.rejects(api("/api/admin/tournaments/1"), { message: "common.requestTooLarge" });
  }
});

test("browser preserves ordinary API validation errors", async () => {
  const api = new Function("fetch", "t", `${apiSource}; return api;`)(
    async () => ({ ok: false, status: 400, json: async () => ({ error: "Name is required" }) }), (key) => key
  );
  await assert.rejects(api("/api/admin/tournaments/1"), { message: "Name is required" });
});
