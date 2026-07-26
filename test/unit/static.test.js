const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { PUBLIC_DIR } = require("../../src/config");
const { resolveStaticPath } = require("../../src/http/static");

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
