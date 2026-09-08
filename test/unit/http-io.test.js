const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");

const {
  HttpError,
  ValidationError,
  SECURITY_HEADERS,
  readBody,
  clientKey,
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
  const stream = Readable.from(chunks, { autoDestroy: false });
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

test("readBody rejects oversized input without destroying the response socket", async () => {
  const stream = fakeRequest("x".repeat(50));
  await assert.rejects(() => readBody(stream, 10), HttpError);
  assert.equal(stream.destroyed, false);
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
  assert.equal(stream.destroyed, false);
});

test("clientKey игнорирует X-Forwarded-For, когда trustProxy выключен (Blocker 1)", () => {
  const req = {
    headers: { "x-forwarded-for": "1.2.3.4" },
    socket: { remoteAddress: "10.0.0.9" }
  };
  assert.equal(clientKey(req, false), "10.0.0.9");
});

test("clientKey использует правый (добавленный прокси) адрес, когда trustProxy включён (Blocker 1)", () => {
  const req = {
    headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    socket: { remoteAddress: "10.0.0.9" }
  };
  // 1.2.3.4 is whatever the client put in the header; 5.6.7.8 is what this
  // app's own trusted proxy appended, so only that one is trustworthy.
  assert.equal(clientKey(req, true), "5.6.7.8");
});

test("clientKey с trustProxy включённым падает обратно на remoteAddress без заголовка", () => {
  const req = { headers: {}, socket: { remoteAddress: "10.0.0.9" } };
  assert.equal(clientKey(req, true), "10.0.0.9");
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
  assert.equal(res.headers["Referrer-Policy"], "no-referrer");
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

test("SECURITY_HEADERS разрешает data: и blob: только для картинок", () => {
  const csp = SECURITY_HEADERS["Content-Security-Policy"];
  assert.ok(csp.includes("img-src 'self' data: blob:"));
  assert.ok(!csp.includes("script-src 'self' data:"));
  assert.ok(!csp.includes("script-src 'self' blob:"));
});

// A response Node built itself carries `res.req`; sendJson reads Accept-Encoding
// from there, so a compression test needs one too. `end` keeps the raw chunk
// instead of concatenating it into a string: a compressed body is binary.
function fakeCompressibleResponse(acceptEncoding) {
  return {
    statusCode: null,
    headers: null,
    chunk: null,
    headersSent: false,
    req: { headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} },
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
      this.headersSent = true;
    },
    end(chunk = "") {
      this.chunk = chunk;
    }
  };
}

// Big enough to clear the 1 KB floor, repetitive enough that compressing it
// actually wins -- which is what a real API list response looks like.
function bigBody() {
  return { rows: Array.from({ length: 400 }, (_, index) => ({ id: index, name: `Player ${index}`, rating: 1000 })) };
}

function settled(res) {
  return new Promise((resolve) => {
    const poll = () => (res.headersSent ? resolve(res) : setImmediate(poll));
    poll();
  });
}

test("sendJson сжимает крупный ответ в brotli, когда клиент это принимает", async () => {
  const zlib = require("node:zlib");
  const body = bigBody();
  const res = fakeCompressibleResponse("br, gzip");
  sendJson(res, 200, body);
  await settled(res);

  assert.equal(res.headers["Content-Encoding"], "br");
  assert.equal(res.headers.Vary, "Accept-Encoding");
  assert.ok(Buffer.isBuffer(res.chunk));
  assert.equal(res.headers["Content-Length"], res.chunk.length);
  assert.ok(res.chunk.length < Buffer.byteLength(JSON.stringify(body)));
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(res.chunk).toString("utf8")), body);
});

test("sendJson отдаёт gzip, если brotli не предложен", async () => {
  const zlib = require("node:zlib");
  const body = bigBody();
  const res = fakeCompressibleResponse("gzip");
  sendJson(res, 200, body);
  await settled(res);

  assert.equal(res.headers["Content-Encoding"], "gzip");
  assert.deepEqual(JSON.parse(zlib.gunzipSync(res.chunk).toString("utf8")), body);
});

test("sendJson не сжимает, если клиент не просил кодировку", () => {
  const res = fakeCompressibleResponse("");
  sendJson(res, 200, bigBody());

  assert.equal(res.headers["Content-Encoding"], undefined);
  assert.equal(res.headers.Vary, "Accept-Encoding");
  assert.equal(typeof res.chunk, "string");
});

test("sendJson не сжимает ответ мельче порога", () => {
  const res = fakeCompressibleResponse("br");
  sendJson(res, 200, { ok: true });

  assert.equal(res.headers["Content-Encoding"], undefined);
  assert.equal(res.chunk, '{"ok":true}');
});

test("sendJson с q=0 уважает отказ клиента от кодировки", () => {
  const res = fakeCompressibleResponse("br;q=0, gzip;q=0");
  sendJson(res, 200, bigBody());

  assert.equal(res.headers["Content-Encoding"], undefined);
});

test("пока тело сжимается, второй sendJson по тому же ответу ничего не пишет", async () => {
  const zlib = require("node:zlib");
  const first = bigBody();
  const res = fakeCompressibleResponse("br");
  sendJson(res, 200, first);
  sendJson(res, 500, { error: "second" });
  await settled(res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(res.chunk).toString("utf8")), first);
});
