const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const extract = name => source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0];

function harness(admin = false) {
  const state = { me: admin ? { id: 1, isAdmin: true } : null, view: "tournaments", tournamentsTab: admin ? "admin" : "public", selectedTournamentId: 4, tournamentInfoTab: "matches" };
  const feed = { key: "", revision: null }, calls = [], renders = [], scrolls = [];
  const doc = { visibilityState: "visible", querySelector: () => null, activeElement: null };
  const win = { location: { pathname: admin ? "/" : "/tournaments/cup", hash: admin ? "#/tournaments/admin/4" : "" }, scrollY: 350, scrollTo: (...args) => scrolls.push(args), clearTimeout() {}, setTimeout: () => 1 };
  let revision = "one", deferred;
  const api = async url => { calls.push(url); return url.endsWith("revision") ? { revision, isAdmin: admin } : deferred || { tournament: { id: 4 } }; };
  const render = data => renders.push(data);
  const fn = new Function("state", "tournamentFeed", "document", "window", "api", "renderPublicTournament", "renderRosterProfile", "renderTournaments", `
    let tournamentRefreshEpoch = 0, tournamentWritesPending = 0;
    const tournamentSlugFromLocation = () => window.location.pathname.startsWith('/tournaments/') ? 'cup' : '';
    const loadAdminUi = async () => true;
    ${extract("tournamentLiveEditing")}
    ${extract("pollTournamentFeed")}
    return { poll: pollTournamentFeed, write: () => { tournamentRefreshEpoch++; } };
  `)(state, feed, doc, win, api, render, render, () => render(state.adminTournamentDetail));
  return { ...fn, state, doc, win, feed, calls, renders, scrolls, revision: value => { revision = value; }, response: value => { deferred = value; } };
}

test("live tournament views download full data only after a revision changes and retain tab and scroll", async () => {
  for (const admin of [false, true]) {
    const h = harness(admin);
    await h.poll(); await h.poll();
    assert.deepEqual(h.calls, ["/api/tournaments/revision", admin ? "/api/admin/tournaments/4" : "/api/tournaments/cup", "/api/tournaments/revision"]);
    assert.equal(h.renders.length, 1);
    assert.equal(h.state.tournamentInfoTab, "matches");
    assert.deepEqual(h.scrolls, [[0, 350]]);
    h.revision("two"); await h.poll();
    assert.equal(h.renders.length, 2);
  }
});

test("drafts, open dialogs, focused fields and hidden pages are not replaced", async () => {
  const h = harness();
  h.doc.querySelector = () => ({}); await h.poll();
  h.doc.querySelector = () => null;
  h.doc.activeElement = { matches: () => true }; await h.poll();
  h.doc.activeElement = null;
  h.doc.visibilityState = "hidden"; await h.poll();
  assert.equal(h.calls.length, 0);
  h.doc.visibilityState = "visible"; await h.poll();
  assert.equal(h.renders.length, 1);
});

test("in-flight responses cannot overwrite a later edit, tab switch or page navigation", async () => {
  for (const change of [h => h.write(), h => { h.state.tournamentInfoTab = "participants"; }, h => { h.win.location.hash = "#/games"; }]) {
    const h = harness();
    let resolve;
    h.response(new Promise(done => { resolve = done; }));
    const pending = h.poll();
    await Promise.resolve(); await Promise.resolve();
    change(h); resolve({ tournament: { id: 4 } }); await pending;
    assert.equal(h.renders.length, 0);
    assert.equal(h.feed.revision, null);
  }
});

test("navigation preserves native new-tab gestures but routes ordinary left clicks inside the app", () => {
  const click = new Function(`${extract("handleAppLinkClick")}; return handleAppLinkClick;`)();
  for (const gesture of [{ button: 1 }, { button: 0, ctrlKey: true }, { button: 0, metaKey: true }, { button: 0, shiftKey: true }]) {
    let prevented = false, stopped = false;
    click({ ...gesture, target: { closest: () => ({ href: "/#/team-matches/1" }) }, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
    assert.equal(prevented, false); assert.equal(stopped, true);
  }
  let prevented = false;
  click({ button: 0, target: { closest: () => ({}) }, preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});

test("new tournament logos preserve proportions within 640 pixels without upscaling", async () => {
  for (const [width, height, expected] of [[1600, 800, [640, 320]], [200, 300, [200, 300]]]) {
    const canvas = { getContext: () => ({ drawImage() {} }) };
    const resize = new Function("t", "loadImage", "document", "canvasToBlob", "blobToDataUrl", `${extract("resizeTournamentLogo")}; return resizeTournamentLogo;`)(
      key => key, async () => ({ naturalWidth: width, naturalHeight: height }), { createElement: () => canvas },
      async (_canvas, type) => { assert.equal(type, "image/webp"); return "blob"; }, async () => "data:image/webp;base64,YQ=="
    );
    assert.equal(await resize({ type: "image/png", size: 100 }), "data:image/webp;base64,YQ==");
    assert.deepEqual([canvas.width, canvas.height], expected);
  }
});
