const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");

function sourceOf(name) {
  const source = appSource.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(source, `could not find ${name} in public/app.js`);
  return source;
}

test("public tournament Edit is available only to authenticated admins", () => {
  for (const me of [null, { id: 2 }, { id: 2, isAdmin: false }, { id: 1, isAdmin: true }]) {
    const button = new Function("state", "t", `${sourceOf("tournamentEditButton")}; return tournamentEditButton;`)(
      { me }, () => "Edit"
    );
    for (const participantMode of ["individual", "team"]) {
      for (const status of ["draft", "registration_open", "registration_closed", "in_progress", "completed", "cancelled"]) {
        const html = button({ id: 6, participantMode, status, viewer: { canAdmin: true } });
        if (me?.isAdmin) assert.match(html, /data-tournament-edit="6">Edit<\/button>/);
        else assert.equal(html, "");
      }
    }
    for (const id of [undefined, null, "", 0, -1, 1.5, "6<script>", Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(button({ id }), "");
    }
  }
});

test("every public tournament category groups Open/Edit separately from its status", () => {
  for (const isAdmin of [false, true]) {
    const render = new Function("state", "t", "escapeHtml", "tournamentFormatLabel", "tournamentStatusLabel", "tournamentStatusClass", "tournamentParticipantCountLabel", "tournamentRoundCountLabel", "fmtDate",
      `${sourceOf("tournamentEditButton")}; ${sourceOf("tournamentCardFact")}; ${sourceOf("publicTournamentCard")}; return publicTournamentCard;`
    )({ me: { isAdmin } }, (key) => key, String, () => "Swiss", String, () => "open", () => "24", () => "4", String);
    for (const participantMode of ["individual", "team"]) {
      for (const status of ["registration_open", "registration_closed", "in_progress", "completed", "cancelled"]) {
        const html = render({ id: 6, slug: "test-cup", participantMode, status });
        assert.match(html, /class="tournament-card-actions">\s*<span class="status [^"]+">[^<]+<\/span>\s*<div class="tournament-card-buttons">/);
        const buttons = html.match(/class="tournament-card-buttons">([\s\S]*?)<\/div>/)[1];
        assert.match(buttons, /data-tournament-open="test-cup"/);
        assert.equal(buttons.includes('data-tournament-edit="6"'), isAdmin);
        assert.equal((buttons.match(/<button /g) || []).length, isAdmin ? 2 : 1);
        assert.doesNotMatch(buttons, /class="status/);
      }
    }
  }
});

test("admin tournament rows share the same card button layout for every status", () => {
  const render = new Function("t", "escapeHtml", "tournamentFormatLabel", "tournamentStatusLabel", "tournamentStatusClass", "fmtDate",
    `${sourceOf("adminTournamentRow")}; return adminTournamentRow;`
  )((key) => key, String, () => "Swiss", String, () => "open", String);
  for (const status of ["draft", "registration_open", "registration_closed", "in_progress", "completed", "cancelled"]) {
    const html = render({ id: 6, name: "Test", slug: "test-cup", status });
    assert.match(html, /class="row-card tournament-card"/);
    assert.match(html, /class="tournament-card-actions">\s*<span class="status [^"]+">[^<]+<\/span>\s*<div class="tournament-card-buttons">\s*<button class="small-button" type="button" data-admin-tournament-open="6"/);
  }
});

function editorHarness(options = {}) {
  const state = {
    me: { id: 1, isAdmin: true }, view: "tournaments", tournamentsTab: "public",
    selectedTournamentId: 99, adminTournamentDetail: { tournament: { id: 99 } },
    adminTournamentPreview: { stale: true }, tournamentInfoTab: "matches", ...options.state
  };
  const calls = [];
  const data = { tournament: { id: 6, name: "Fresh tournament" }, rounds: [] };
  const open = new Function("state", "api", "leavePublicTournamentRoute", "syncAppHash", "renderShell",
    `${sourceOf("openTournamentEditor")}; return openTournamentEditor;`
  )(state, async (...args) => {
    calls.push(["api", ...args]);
    if (options.error) throw options.error;
    return data;
  }, () => calls.push(["leave"]), () => calls.push(["hash"]), () => calls.push(["render"]));
  return { state, calls, data, open };
}

test("Edit loads only the selected tournament and opens settings without visiting the admin list", async () => {
  const { state, calls, data, open } = editorHarness();
  await open("6");
  assert.deepEqual(calls, [["api", "/api/admin/tournaments/6"], ["leave"], ["hash"], ["render"]]);
  assert.equal(state.view, "tournaments");
  assert.equal(state.tournamentsTab, "admin");
  assert.equal(state.adminTournamentMode, "detail");
  assert.equal(state.selectedTournamentId, 6);
  assert.equal(state.adminTournamentDetail, data);
  assert.equal(state.adminTournamentPreview, null);
  assert.equal(state.tournamentInfoTab, "settings");
});

test("Edit does not leave the current page or overwrite state if loading fails", async () => {
  const error = new Error("Forbidden");
  const { state, calls, open } = editorHarness({ error });
  const original = structuredClone(state);
  await assert.rejects(open(6), error);
  assert.deepEqual(state, original);
  assert.deepEqual(calls, [["api", "/api/admin/tournaments/6"]]);
});

test("non-admins and invalid tournament IDs cannot trigger editor navigation", async () => {
  for (const me of [null, { id: 2, isAdmin: false }]) {
    const { open, calls } = editorHarness({ state: { me } });
    await open(6);
    assert.deepEqual(calls, []);
  }
  const { open, calls } = editorHarness();
  for (const id of [undefined, null, "", 0, -1, 1.5, "bad", Infinity]) await open(id);
  assert.deepEqual(calls, []);
});

test("Edit converts the canonical public URL into the exact admin detail URL", () => {
  const state = { view: "tournaments", tournamentsTab: "admin", adminTournamentMode: "detail", selectedTournamentId: 6, me: { isAdmin: true } };
  const urls = [];
  const sync = new Function("state", "window", "tournamentSlugFromPath", "playerTeamSlugFromPath",
    `${sourceOf("appHashForState")}; ${sourceOf("syncAppHash")}; return syncAppHash;`
  )(state, {
    location: { pathname: "/tournaments/test-cup", search: "", hash: "" },
    history: { pushState: (_state, _title, url) => urls.push(url) }
  }, () => "test-cup", () => "");
  sync();
  assert.deepEqual(urls, ["/#/tournaments/admin/6"]);
});

test("Edit click gives error feedback and re-enables the button after a failed request", async () => {
  let listener;
  let reject;
  const messages = [];
  const button = { dataset: { tournamentEdit: "6" }, isConnected: true, disabled: false,
    addEventListener: (event, callback) => { assert.equal(event, "click"); listener = callback; } };
  const wire = new Function("document", "openTournamentEditor", "setMessage",
    `${sourceOf("wireTournamentEditButtons")}; return wireTournamentEditButtons;`
  )({ querySelectorAll: () => [button] }, (id) => {
    assert.equal(id, "6");
    return new Promise((_resolve, rejectPromise) => { reject = rejectPromise; });
  }, (...args) => messages.push(args));
  wire();
  const pending = listener();
  assert.equal(button.disabled, true);
  reject(new Error("Loading failed"));
  await pending;
  assert.equal(button.disabled, false);
  assert.deepEqual(messages, [["Loading failed", true]]);
});
