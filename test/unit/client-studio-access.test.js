const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const model = require("../../public/studio/model");
const source = fs.readFileSync(path.join(__dirname, "../../public/studio/account.js"), "utf8");
const storage = (values = new Map()) => ({
  values, getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)
});

async function boot({ user = null, currentUser = user, loginSuccess = true, local = storage(), session = storage(), url = "http://localhost/studio/", saveFails = false } = {}) {
  const project = model.newProject("existing-id", "Guest edits");
  const nodes = { "studio-gate": { hidden: false }, "studio-workspace": { hidden: true } };
  const redirects = [], requests = [], loginActions = [], location = new URL(url);
  location.replace = target => redirects.push(target);
  const root = {
    URL, URLSearchParams, crypto: { randomUUID }, location,
    history: { replaceState: (_state, _title, target) => { location.href = new URL(target, location.origin).href; } },
    sessionStorage: session, localStorage: local,
    document: { getElementById: id => nodes[id], addEventListener() {} },
    KTCompanion: { ready: Promise.resolve({ user }), session: async () => ({ user: currentUser }), changed() {} },
    KTStudioLogin: { open: async action => { loginActions.push(action); return loginSuccess; } },
    KTModel: model, ktStudio: { getData: () => structuredClone(project) },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => [] }; }
  };
  root.window = root;
  root.KTStorage = {
    save: async (key, value) => { if (saveFails) return false; root.KTAccount.storage.setItem(key, value); return true; },
    flush: async () => {}, create: ({ storage }) => ({ load: async key => storage.getItem(key) })
  };
  await vm.runInNewContext(source, root);
  return { account: root.KTAccount, nodes, local, session, redirects, requests, project, loginActions };
}

test("guests can open the editor and use public requests without an account header", async () => {
  const guest = await boot();
  assert.equal(guest.account.id, null);
  assert.equal(guest.nodes["studio-workspace"].hidden, false);
  assert.equal(guest.nodes["studio-gate"].hidden, true);
  await guest.account.request("/api/library");
  assert.equal(guest.requests.at(-1).url, "/api/studio/library");
  assert.equal(guest.requests.at(-1).options.headers["X-Studio-Account"], undefined);
});

test("popup login stays in Studio, transfers only the selected guest project and consumes the return token", async () => {
  const guest = await boot();
  assert.equal(await guest.account.requireLogin("publish"), false);
  const next = new URL(guest.redirects[0], "http://localhost");
  assert.equal(next.pathname, "/studio");
  assert.deepEqual(guest.loginActions, ["publish"]);
  const account = await boot({ user: { id: 42 }, local: guest.local, session: guest.session, url: next.href });
  const existing = JSON.stringify(model.newProject("existing-id", "Private team"));
  account.account.storage.setItem("kt-studio-cards-v6:existing-id", existing);
  const transfer = await account.account.transfer();
  assert.equal(transfer.action, "publish");
  assert.equal(transfer.project.team.name, "Guest edits");
  assert.notEqual(transfer.project.team.id, "existing-id");
  assert.equal(account.account.storage.getItem("kt-studio-cards-v6:existing-id"), existing);
  account.account.finishTransfer();
  const replay = await boot({ user: { id: 42 }, local: guest.local, session: guest.session, url: next.href });
  assert.equal(await replay.account.transfer(), null);
});

test("cancelling popup login retains guest edits, clears the transfer and allows another attempt", async () => {
  const guest = await boot({ loginSuccess: false });
  for (const action of ["drafts", "save"]) {
    assert.equal(await guest.account.requireLogin(action), false);
    assert.equal(guest.session.getItem("kt-studio-login-transfer"), null);
    assert.equal(JSON.parse(guest.account.storage.getItem("kt-studio-cards-v6:existing-id")).team.name, "Guest edits");
  }
  assert.deepEqual(guest.loginActions, ["drafts", "save"]);
  assert.deepEqual(guest.redirects, []);
});

test("a guest tab reuses a session established elsewhere without requesting credentials again", async () => {
  const guest = await boot({ currentUser: { id: 42 } });
  assert.equal(await guest.account.requireLogin("drafts"), false);
  assert.deepEqual(guest.loginActions, []);
  assert.equal(new URL(guest.redirects[0], "http://localhost").pathname, "/studio");
});

test("ordinary login, a mismatched return token and another guest tab do not claim guest edits", async () => {
  const guest = await boot();
  await guest.account.requireLogin("save");
  for (const url of ["http://localhost/studio/", "http://localhost/studio/?resume=wrong-token"]) {
    const signedIn = await boot({ user: { id: 7 }, local: guest.local, session: guest.session, url });
    assert.equal(await signedIn.account.transfer(), null);
  }
  const otherTab = await boot({ local: guest.local });
  assert.equal(otherTab.account.storage.getItem("kt-studio-cards-v6:existing-id"), null);
  assert.notEqual(otherTab.account.databaseName, guest.account.databaseName);
});

test("a failed recovery save keeps the guest in the editor and allows retry", async () => {
  const guest = await boot({ saveFails: true });
  await assert.rejects(guest.account.requireLogin("save"), /Не удалось подготовить/);
  await assert.rejects(guest.account.requireLogin("save"), /Не удалось подготовить/);
  assert.deepEqual(guest.redirects, []);
  assert.equal(guest.session.getItem("kt-studio-login-transfer"), null);
});
