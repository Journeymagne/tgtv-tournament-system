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
  sendText,
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

// `body` is either a string (delivered as a single chunk, for backward
// compatibility) or an array of chunks (strings/Buffers) delivered in order —
// used to simulate a multi-byte character split across TCP packet boundaries.
function fakeRequest(body, headers = {}) {
  let chunks;
  if (Array.isArray(body)) {
    chunks = body.map((part) => (Buffer.isBuffer(part) ? part : Buffer.from(part)));
  } else {
    chunks = body ? [Buffer.from(body)] : [];
  }
  const stream = Readable.from(chunks);
  stream.headers = headers;
  stream.destroyed = false;
  stream.destroy = () => {
    stream.destroyed = true;
  };
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

test("readBody отвергает слишком большое тело и останавливает поток", async () => {
  const stream = fakeRequest("x".repeat(50));
  await assert.rejects(() => readBody(stream, 10), HttpError);
  assert.equal(stream.destroyed, true);
});

test("readBody собирает многобайтовый символ, разбитый между чанками, без повреждения", async () => {
  // "é" is 2 bytes in UTF-8 (0xC3 0xA9). Split the buffer so the two bytes of
  // that one character land in different chunks — this is exactly the case
  // where naive `body += chunk` decodes each chunk as UTF-8 independently and
  // turns the character into replacement bytes.
  const json = '{"name":"café"}';
  const full = Buffer.from(json, "utf8");
  const eBytes = Buffer.from("é", "utf8");
  const splitPoint = full.indexOf(eBytes) + 1;
  assert.ok(splitPoint > 0 && splitPoint < full.length, "test setup must actually split the character");

  const chunks = [full.subarray(0, splitPoint), full.subarray(splitPoint)];
  const body = await readBody(fakeRequest(chunks), 1000);
  assert.deepEqual(body, { name: "café" });
});

test("readBody отвергает тело, чей байтовый размер превышает лимит при меньшей длине строки", async () => {
  // Six Cyrillic characters: 6 UTF-16 code units (body.length === 6) but
  // 12 UTF-8 bytes — under the old `body.length > maxBytes` check this would
  // slip under a maxBytes of 10; the byte-counting check must still reject it.
  const body = "п".repeat(6);
  assert.equal(body.length, 6);
  assert.ok(Buffer.byteLength(body, "utf8") > 10);

  const stream = fakeRequest(body);
  await assert.rejects(() => readBody(stream, 10), HttpError);
  assert.equal(stream.destroyed, true);
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

test("sendText проставляет статус, text/plain и security-заголовки", () => {
  const res = fakeResponse();
  sendText(res, 404, "Not found");

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload, "Not found");
  assert.equal(res.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(res.headers["Content-Length"], Buffer.byteLength("Not found"));
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.headers["X-Frame-Options"], "DENY");
  assert.equal(res.headers["Referrer-Policy"], "same-origin");
  assert.ok(res.headers["Content-Security-Policy"].includes("script-src 'self'"));
});

test("sendText ничего не пишет, если ответ уже отправлен", () => {
  const res = fakeResponse();
  sendText(res, 200, "first");
  sendText(res, 500, "second");
  assert.equal(res.payload, "first");
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
