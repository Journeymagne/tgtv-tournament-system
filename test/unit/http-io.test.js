const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const {
  HttpError,
  ValidationError,
  SECURITY_HEADERS,
  readBody,
  parseCookies,
  sendJson,
  sessionCookie,
  clearedSessionCookie
} = require("../../src/http/io");

function fakeResponse() {
  return {
    statusCode: null,
    headers: null,
    payload: "",
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk = "") {
      this.payload += chunk;
    }
  };
}

function fakeRequest(body, headers = {}) {
  const stream = Readable.from(body ? [Buffer.from(body)] : []);
  stream.headers = headers;
  stream.destroy = () => {};
  return stream;
}

test("HttpError несёт статус", () => {
  const err = new HttpError(409, "Conflict happened");
  assert.equal(err.status, 409);
  assert.equal(err.message, "Conflict happened");
  assert.ok(err instanceof Error);
});

test("ValidationError — это HttpError со статусом 400", () => {
  const err = new ValidationError("Bad input");
  assert.equal(err.status, 400);
  assert.ok(err instanceof HttpError);
});

test("readBody разбирает JSON", async () => {
  const body = await readBody(fakeRequest('{"a":1}'), 1000);
  assert.deepEqual(body, { a: 1 });
});

test("readBody на пустом теле возвращает пустой объект", async () => {
  assert.deepEqual(await readBody(fakeRequest(""), 1000), {});
});

test("readBody отвергает некорректный JSON как ValidationError", async () => {
  await assert.rejects(() => readBody(fakeRequest("{oops"), 1000), ValidationError);
});

test("readBody отвергает слишком большое тело", async () => {
  await assert.rejects(() => readBody(fakeRequest("x".repeat(50)), 10), HttpError);
});

test("parseCookies разбирает пары", () => {
  const req = { headers: { cookie: "sid=abc123; theme=dark" } };
  assert.deepEqual(parseCookies(req), { sid: "abc123", theme: "dark" });
});

test("parseCookies на пустом заголовке возвращает пустой объект", () => {
  assert.deepEqual(parseCookies({ headers: {} }), {});
});

test("sendJson проставляет security-заголовки и Content-Length", () => {
  const res = fakeResponse();
  sendJson(res, 200, { ok: true });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload, '{"ok":true}');
  assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(res.headers["Content-Length"], Buffer.byteLength('{"ok":true}'));
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
  assert.ok(res.headers["Content-Security-Policy"].includes("script-src 'self'"));
});

test("sendJson ничего не пишет, если ответ уже отправлен", () => {
  const res = fakeResponse();
  sendJson(res, 200, { first: true });
  sendJson(res, 500, { second: true });
  assert.equal(res.payload, '{"first":true}');
});

test("sessionCookie ставит Secure только когда попрошено", () => {
  assert.ok(!sessionCookie("t", 1000, false).includes("Secure"));
  assert.ok(sessionCookie("t", 1000, true).includes("Secure"));
  assert.ok(sessionCookie("t", 1000, false).includes("HttpOnly"));
  assert.ok(sessionCookie("t", 1000, false).includes("Max-Age=1"));
});

test("clearedSessionCookie обнуляет срок жизни", () => {
  assert.ok(clearedSessionCookie(false).includes("Max-Age=0"));
});

test("SECURITY_HEADERS разрешает data: только для картинок", () => {
  const csp = SECURITY_HEADERS["Content-Security-Policy"];
  assert.ok(csp.includes("img-src 'self' data:"));
  assert.ok(!csp.includes("script-src 'self' data:"));
});
