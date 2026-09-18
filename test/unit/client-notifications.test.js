const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const sourceOf = name => source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))[0];

function client(state, api) {
  return new Function("state", "api", "window", "renderNotificationControl", "scheduleNotificationPoll", "resetNotifications", `
    let notificationRequestId = 0, notificationPollTimer = null;
    ${sourceOf("loadNotifications")}
    ${sourceOf("markNotificationRead")}
    return { loadNotifications, markNotificationRead };
  `)(state, api, { clearTimeout() {} }, () => {}, () => {}, () => {});
}

test("opening or refreshing notifications does not mark them read", async () => {
  const state = { me: { id: 1 }, notificationsOpen: true };
  const items = [{ id: "game_challenge:1", unread: true }];
  const ui = client(state, async (url, options) => {
    assert.equal(url, "/api/notifications");
    assert.equal(options, undefined);
    return { items, unreadCount: 1 };
  });
  await ui.loadNotifications();
  await ui.loadNotifications();
  assert.equal(state.notifications[0].unread, true);
  assert.equal(state.notificationsUnreadCount, 1);
  assert.doesNotMatch(sourceOf("wireNotificationControl"), /markRead:|through:/);
});

test("a click saves only its item and an older poll cannot restore its unread state", async () => {
  const items = [1, 2].map(id => ({ id: `game_challenge:${id}`, unread: true }));
  const state = { me: { id: 1 }, notifications: items, notificationsUnreadCount: 2 };
  let finishOldPoll, gets = 0;
  const ui = client(state, async (url, options) => {
    if (url === "/api/notifications/read") {
      assert.deepEqual(options, { method: "POST", body: { id: items[0].id } });
      return { id: items[0].id, readAt: "2026-09-18T12:00:00.000Z" };
    }
    if (++gets === 1) return new Promise(resolve => { finishOldPoll = resolve; });
    return { items: [{ ...items[0], unread: false }, items[1]], unreadCount: 1 };
  });
  const oldPoll = ui.loadNotifications();
  assert.equal(await ui.markNotificationRead(items[0]), true);
  finishOldPoll({ items, unreadCount: 2 });
  await oldPoll;
  assert.deepEqual(state.notifications.map(item => item.unread), [false, true]);
  assert.equal(state.notificationsUnreadCount, 1);
  const failing = client(state, async () => { throw Error("offline"); });
  await assert.rejects(() => failing.markNotificationRead(items[1]), /offline/);
  assert.equal(state.notifications[1].unread, true);
});

test("notification navigation waits for the read to save and completed games remain accessible", async () => {
  const state = { notificationsOpen: true };
  const opened = [];
  let save;
  const open = new Function("state", "markNotificationRead", "renderNotificationControl", "navigateToPublicTournament", "loadGame", "openGameDetail", `
    ${sourceOf("openNotificationItem")}; return openNotificationItem;
  `)(state, () => new Promise(resolve => { save = resolve; }), () => {}, (...args) => opened.push(args),
    async id => ({ id, status: "completed", tournament: { status: "completed" } }), id => opened.push(id));
  const pending = open({ type: "tournament_started", tournament: { slug: "cup" }, unread: true });
  assert.equal(opened.length, 0);
  save(true);
  await pending;
  assert.equal(state.notificationsOpen, false);
  assert.deepEqual(opened[0], ["cup", { tab: "matches", force: true }]);
  await open({ type: "team_tournament_pairing", gameId: 7, unread: false });
  assert.equal(opened[1], 7);
});
