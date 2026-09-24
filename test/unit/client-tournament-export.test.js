const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/admin.js"), "utf8");
function sourceOf(name) {
  const code = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(code);
  return code;
}

test("Excel export appears in individual settings even after completion, outside the save form", () => {
  const render = new Function("t", "adminTournamentEditForm", `${sourceOf("adminTournamentSettingsContent")}; return adminTournamentSettingsContent;`)(
    key => key, () => "<form></form>"
  );
  for (const status of ["draft", "registration_open", "in_progress", "completed", "cancelled"]) {
    const html = render({ tournament: { id: 6, participantMode: "individual", status } });
    assert.match(html, /type="button".*data-admin-tournament-action="export-excel"/);
    assert.doesNotMatch(html, /disabled/);
    assert.ok(html.indexOf("export-excel") < html.indexOf("<form>"));
    assert.doesNotMatch(render({ tournament: { id: 6, participantMode: "team", status } }), /export-excel/);
  }
});

function downloadHarness(response) {
  const calls = [];
  const button = { isConnected: true, disabled: false };
  const link = { click: () => calls.push("click"), remove: () => calls.push("remove") };
  const download = new Function("document", "fetch", "URL", "setTimeout", "t", `${sourceOf("downloadTournamentExcel")}; return downloadTournamentExcel;`)(
    { querySelector: () => button, createElement: () => link, body: { appendChild: () => calls.push("append") } },
    async (url, options) => { calls.push([url, options]); return response; },
    { createObjectURL: () => "blob:export", revokeObjectURL: url => calls.push(["revoke", url]) },
    fn => fn(), key => key
  );
  return { download, calls, button, link };
}

test("download saves an XLSX blob, cleans up and re-enables the button", async () => {
  const h = downloadHarness({ ok: true, blob: async () => new Blob(["xlsx"]) });
  await h.download({ id: 6, name: "Кубок" });
  assert.deepEqual(h.calls, [["/api/admin/tournaments/6/export.xlsx", { credentials: "same-origin" }], "append", "click", "remove", ["revoke", "blob:export"]]);
  assert.equal(h.link.download, "Кубок-results.xlsx");
  assert.equal(h.button.disabled, false);
});

test("failed downloads show the API error and do not download an error document", async () => {
  const h = downloadHarness({ ok: false, json: async () => ({ error: "Forbidden" }) });
  await assert.rejects(h.download({ id: 6 }), /Forbidden/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.button.disabled, false);
  h.button.disabled = true;
  await h.download({ id: 6 });
  assert.equal(h.calls.length, 1);
});
