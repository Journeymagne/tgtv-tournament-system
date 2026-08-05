const http = require("node:http");

async function startApiServer(handler) {
  const server = http.createServer((req, res) => {
    const result = handler(req, res);
    if (result && typeof result.catch === "function") {
      result.catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

function createClient(baseUrl) {
  let cookie = "";

  async function request(method, path, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    for (const entry of setCookie) {
      const pair = entry.split(";")[0];
      if (pair.startsWith("sid=")) cookie = pair;
    }
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body ?? {}),
    patch: (path, body) => request("PATCH", path, body ?? {}),
    del: (path) => request("DELETE", path),
    clearCookie: () => {
      cookie = "";
    }
  };
}

module.exports = { startApiServer, createClient };
