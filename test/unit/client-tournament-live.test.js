const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const extract = name => source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0];

function harness(admin = false) {
  const { liveHarness } = require("../helpers/live-refresh");
  const state = { me: admin ? { id: 1, isAdmin: true } : null };
  const feed = { key: "", revision: null }, calls = [];
  let revision = "one", deferred;
  const api = async url => { calls.push(url); return url.endsWith("revision") ? { revision, isAdmin: admin } : deferred || { tournament: { id: 4 } }; };
  const fn = new Function("state", "tournamentFeed", "api", `
    let tournamentRefreshEpoch = 0;
    const loadAdminUi = async () => true;
    ${extract("fetchLiveRefresh")}
    return { fetch: fetchLiveRefresh, write: () => { tournamentRefreshEpoch++; } };
  `)(state, feed, api);
  const h = liveHarness({ fetch: fn.fetch });
  h.current = { ...h.current, key: "cup:matches", kind: admin ? "adminTournament" : "tournament", url: admin ? "/api/admin/tournaments/4" : "/api/tournaments/cup" };
  return { ...h, poll: () => h.controller.run(), write: () => { fn.write(); h.controller.startWrite(); h.controller.endWrite(); },
    changeTarget: () => { h.current = { ...h.current, key: "other:matches" }; },
    block: value => { h.blocked = value; }, doc: h.document, feed, calls,
    revision: value => { revision = value; }, response: value => { deferred = value; } };
}

test("live tournament views download full data only after a revision changes", async () => {
  for (const admin of [false, true]) {
    const h = harness(admin);
    await h.poll(); await h.poll();
    assert.deepEqual(h.calls, ["/api/tournaments/revision", admin ? "/api/admin/tournaments/4" : "/api/tournaments/cup", "/api/tournaments/revision"]);
    assert.equal(h.renders.length, 1);
    h.revision("two"); h.response({ tournament: { id: 4, updated: true } }); await h.poll();
    assert.equal(h.renders.length, 2);
  }
});

test("deferred revision data survives repeated checks and applies once after interaction ends", async () => {
  const h = harness();
  h.block(true); await h.poll(); await h.poll();
  assert.equal(h.renders.length, 0);
  assert.equal(h.calls.filter(url => !url.endsWith("revision")).length, 1);
  h.block(false); h.controller.flush();
  assert.equal(h.renders.length, 1);
  h.doc.visibilityState = "hidden";
  const previous = h.calls.length; await h.poll();
  assert.equal(h.calls.length, previous);
});

test("in-flight revision responses cannot overwrite a later edit or target change", async () => {
  for (const change of [h => h.write(), h => h.changeTarget()]) {
    const h = harness();
    let resolve;
    h.response(new Promise(done => { resolve = done; }));
    const pending = h.poll();
    await Promise.resolve(); await Promise.resolve();
    change(h); resolve({ tournament: { id: 4 } }); await pending;
    assert.equal(h.renders.length, 0);
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
