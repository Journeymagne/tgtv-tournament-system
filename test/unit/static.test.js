const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { PUBLIC_DIR } = require("../../src/config");
const { resolveStaticPath, sendStatic } = require("../../src/http/static");

test("корень отдаёт index.html", () => {
  assert.equal(resolveStaticPath("/"), path.join(PUBLIC_DIR, "index.html"));
});

test("обычный файл разрешается внутри public", () => {
  assert.equal(resolveStaticPath("/app.js"), path.join(PUBLIC_DIR, "app.js"));
});

test("подкаталог разрешается", () => {
  assert.equal(
    resolveStaticPath("/kill-team-logos/Kasrkin.png"),
    path.join(PUBLIC_DIR, "kill-team-logos", "Kasrkin.png")
  );
});

test("percent-encoded имя декодируется", () => {
  assert.equal(
    resolveStaticPath("/kill-team-logos/Death%20Korps.png"),
    path.join(PUBLIC_DIR, "kill-team-logos", "Death Korps.png")
  );
});

test("выход вверх по дереву отклоняется", () => {
  assert.equal(resolveStaticPath("/../server.js"), null);
});

test("соседний каталог с тем же префиксом отклоняется", () => {
  assert.equal(resolveStaticPath("/../public-secrets/keys.txt"), null);
});

test("NUL-байт в пути отклоняется, а не передаётся в fs", () => {
  // decodeURIComponent turns %00 into a real NUL character. fs.readFile
  // throws *synchronously* on a path containing a NUL byte (see the
  // sendStatic test below), so resolveStaticPath must reject it up front
  // rather than letting it survive the PUBLIC_PREFIX check.
  assert.equal(resolveStaticPath("/foo%00.png"), null);
  assert.equal(resolveStaticPath("/kill-team-logos/%00/x.png"), null);
});

// --- sendStatic ---------------------------------------------------------
//
// Response mock follows the pattern in test/unit/http-io.test.js, adapted
// with a `whenDone` promise because sendStatic's success/404 paths resolve
// through the real (async) fs.readFile rather than synchronously.

function fakeResponse() {
  let resolveDone;
  const whenDone = new Promise((resolve) => {
    resolveDone = resolve;
  });
  return {
    statusCode: null,
    headers: null,
    payload: null,
    headersSent: false,
    whenDone,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk) {
      this.payload = chunk;
      resolveDone();
    }
  };
}

function fakeRequest(url) {
  return { url, headers: { host: "localhost" } };
}

async function runSendStatic(url) {
  const res = fakeResponse();
  sendStatic(fakeRequest(url), res);
  await res.whenDone;
  return res;
}

test("sendStatic отдаёт существующий файл: статус 200, Content-Type из таблицы MIME, security-заголовки", async () => {
  const res = await runSendStatic("/app.js");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/javascript; charset=utf-8");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
  assert.equal(res.headers["Referrer-Policy"], "same-origin");
  assert.ok(res.headers["Content-Security-Policy"].includes("script-src 'self'"));
});

test("sendStatic ставит no-store, max-age=0 для .html", async () => {
  const res = await runSendStatic("/");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store, max-age=0");
});

test("sendStatic ставит public, max-age=604800 для файлов не .html", async () => {
  const res = await runSendStatic("/styles.css");
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "public, max-age=604800");
});

test("sendStatic отвечает 404 для несуществующего файла и сохраняет security-заголовки", async () => {
  const res = await runSendStatic("/does-not-exist-xyz.png");
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload, "Not found");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
});

test("sendStatic отвечает 403 для пути, выходящего за пределы PUBLIC_DIR, и сохраняет security-заголовки", async () => {
  // A literal "/../server.js" would already be collapsed by `new URL()`
  // before resolveStaticPath ever sees it, so it can't exercise the 403
  // branch through sendStatic's real entry point. An encoded slash inside
  // the first segment survives URL's dot-segment normalization (which only
  // acts on literal "/../"), then decodeURIComponent turns it into a real
  // ".." — this is the realistic way the escape check gets hit in practice.
  const res = await runSendStatic("/..%2fserver.js");
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload, "Forbidden");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
});

test("sendStatic отвечает чистым 403 на NUL-байт в пути вместо падения процесса", async () => {
  const res = await runSendStatic("/foo%00.png");
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload, "Forbidden");
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
});
