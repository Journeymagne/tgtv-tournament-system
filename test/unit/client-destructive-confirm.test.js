const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The client ships as two classic scripts sharing one global scope: app.js and
// admin.js, the latter fetched only for administrators. Destructive buttons
// live in both, so both are scanned.
const FILES = ["app.js", "admin.js"];
const sources = new Map(
  FILES.map((file) => [file, fs.readFileSync(path.join(__dirname, "../../public", file), "utf8")])
);

function functionSource(name) {
  for (const text of sources.values()) {
    const start = text.indexOf("function " + name + "(");
    if (start < 0) continue;
    const end = text.indexOf("\n}", start);
    if (end >= 0) return text.slice(start, end + 2);
  }
  return null;
}

// Every request that destroys or unregisters something. DELETE is matched by
// method; the destructive POSTs are matched by their endpoint, because "POST"
// on its own says nothing about what the request does.
const DESTRUCTIVE_POST = /\/(?:withdraw|archive|leave|exit|remove)`/;

// How far back a confirmation may sit. Handlers here are short: the confirm is
// the guard clause, the request follows within a few lines.
const LOOKBACK = 12;

function destructiveRequests() {
  const found = [];
  for (const [file, text] of sources) {
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/\bapi\(/.test(line)) return;
      if (!/method: "DELETE"/.test(line) && !DESTRUCTIVE_POST.test(line)) return;
      const before = lines.slice(Math.max(0, index - LOOKBACK), index).join("\n");
      found.push({ file, number: index + 1, line, before });
    });
  }
  return found;
}

test("every destructive request is gated by the confirmation modal", () => {
  const found = destructiveRequests();
  assert.ok(found.length >= 15, `sanity: expected destructive requests to scan, found ${found.length}`);
  const unguarded = found.filter(({ before }) => !/\bawait confirm(?:Action|Delete)\(/.test(before));
  assert.deepEqual(
    unguarded.map(({ file, number, line }) => `${file}:${number} ${line.trim()}`),
    [],
    "these requests destroy data without awaiting confirmAction/confirmDelete first"
  );
});

test("window.confirm survives only as the fallback inside confirmAction", () => {
  const modal = functionSource("confirmAction");
  assert.ok(modal, "confirmAction is missing from the client");
  const stray = [];
  for (const [file, text] of sources) {
    text.split(/\r?\n/).forEach((line, index) => {
      if (!/(?<![\w.])(?:window\.)?confirm\(/.test(line)) return;
      if (/^\s*\/\//.test(line)) return;
      if (modal.includes(line.trim())) return;
      stray.push(`${file}:${index + 1} ${line.trim()}`);
    });
  }
  assert.deepEqual(stray, [], "destructive actions must go through confirmAction/confirmDelete, not window.confirm");
});

test("confirmDelete warns that the action is permanent and defaults to cancel", () => {
  const helper = functionSource("confirmDelete");
  assert.ok(helper, "confirmDelete is missing from the client");
  assert.match(helper, /dialog\.confirm\.irreversible/);
  assert.match(helper, /danger: true/);
  const modal = functionSource("confirmAction");
  assert.match(modal, /confirm-dialog-actions \[data-confirm-cancel\]"\)\?\.focus\(\)/);
  assert.match(modal, /showModal\(\)/);
});

// admin.js is fetched only for administrators, so it must never be the file that
// defines a shared helper app.js relies on before that fetch happens.
test("the confirmation modal itself stays in the always-loaded bundle", () => {
  for (const name of ["confirmAction", "confirmDelete"]) {
    assert.ok(
      sources.get("app.js").includes(`function ${name}(`),
      `${name} must live in app.js, not in the on-demand admin bundle`
    );
  }
});
