const test = require("node:test");
const assert = require("node:assert/strict");

const { logRequest, logError } = require("../../src/http/logger");
const { captureStream } = require("../helpers/capture-stream");

test("logRequest пишет одну строку валидного JSON в stdout с ожидаемыми полями", () => {
  const stdout = captureStream(process.stdout);
  const stderr = captureStream(process.stderr);
  try {
    logRequest({ method: "GET", path: "/app.js", status: 200, durationMs: 12 });
  } finally {
    stdout.restore();
    stderr.restore();
  }

  assert.equal(stderr.calls.length, 0);
  assert.equal(stdout.calls.length, 1);

  const line = stdout.calls[0].trimEnd();
  const record = JSON.parse(line);
  assert.equal(record.level, "info");
  assert.equal(record.msg, "request");
  assert.equal(record.method, "GET");
  assert.equal(record.path, "/app.js");
  assert.equal(record.status, 200);
  assert.equal(record.durationMs, 12);
  assert.equal(typeof record.time, "string");
  assert.ok(!Number.isNaN(Date.parse(record.time)));
});

test("logError пишет одну строку валидного JSON в stderr с сообщением и стеком ошибки", () => {
  const stdout = captureStream(process.stdout);
  const stderr = captureStream(process.stderr);
  const err = new Error("boom");
  try {
    logError("db write failed", err);
  } finally {
    stdout.restore();
    stderr.restore();
  }

  assert.equal(stdout.calls.length, 0);
  assert.equal(stderr.calls.length, 1);

  const line = stderr.calls[0].trimEnd();
  const record = JSON.parse(line);
  assert.equal(record.level, "error");
  assert.equal(record.msg, "db write failed");
  assert.equal(record.error, "boom");
  assert.ok(typeof record.stack === "string" && record.stack.includes("boom"));
});

test("logError переживает не-Error значение, приводя его к строке", () => {
  const stdout = captureStream(process.stdout);
  const stderr = captureStream(process.stderr);
  try {
    logError("something odd", "just a string");
  } finally {
    stdout.restore();
    stderr.restore();
  }

  const record = JSON.parse(stderr.calls[0].trimEnd());
  assert.equal(record.error, "just a string");
  assert.equal(record.stack, null);
});
