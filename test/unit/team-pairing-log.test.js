const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const log = require("../../src/api/team-pairing-log");
const app = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const sourceOf = name => app.match(new RegExp("(?:async )?function " + name + "\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}"))[0];
const a = { id: 1, name: "Alpha", captainUserId: 10, members: [{ id: 11, displayNameSnapshot: "Alice", factionSnapshot: "Kasrkin" }] };
const b = { id: 2, name: "Beta", captainUserId: 20, members: [{ id: 21, displayNameSnapshot: "Bob", factionSnapshot: "Novitiates" }] };
function row(type = "shield_select") {
  return { id: 50, event_type: type, actor_user_id: 10, actor_name: "Renamed captain", actor_is_admin: false,
    created_at: "2026-09-20T12:30:00Z", before: { SECRET: "raw undo snapshot" }, after: { SECRET: "raw state" },
    metadata: { actorName: "Captain at selection", side: "a", confirmed: true, SECRET: "audit only",
      ...log.choiceDetails({ rosterA: a, rosterB: b }, "a", 11, "shield", { shieldAMemberId: 11, shieldBMemberId: 21,
        shieldAConfirmed: true, shieldBConfirmed: type === "shields_reveal" }) } };
}

test("hidden choices never reach the opponent, spectators or old public entries after a later reveal", () => {
  for (const user of [null, { id: 20 }, { id: 30 }]) {
    const event = log.eventView(row(), { shieldAConfirmed: true, shieldBConfirmed: true }, a, b, user);
    assert.equal(event.choice, null);
    assert.equal(event.choiceHidden, true);
    const json = JSON.stringify(event);
    for (const hidden of ["Alice", "Kasrkin", "memberId", "SECRET", "metadata", "before", "after"]) assert.ok(!json.includes(hidden), hidden);
    assert.equal(event.actorName, "Captain at selection");
  }
  for (const user of [{ id: 10 }, { id: 99, isAdmin: true }]) {
    const event = log.eventView(row(), {}, a, b, user);
    assert.equal(event.choice.playerName, "Alice");
    assert.equal(event.choice.faction, "Kasrkin");
  }
});

test("reveal events contain the choices actually revealed, even after undo or renaming, and respect faction privacy", () => {
  const event = log.eventView(row("shields_reveal"), { shieldAConfirmed: false }, { ...a, name: "New Alpha" }, b, null);
  assert.deepEqual(event.revealedChoices.map(item => [item.rosterName, item.choice.playerName, item.choice.faction]),
    [["Alpha", "Alice", "Kasrkin"], ["Beta", "Bob", "Novitiates"]]);
  assert.equal(event.rosterName, "Alpha");
  const hidden = log.eventView(row("shields_reveal"), {}, { ...a, members: [{ ...a.members[0], factionHidden: true }] }, b, null);
  assert.equal(hidden.revealedChoices[0].choice.faction, null);
  assert.equal(hidden.revealedChoices[0].choice.factionHidden, true);
});

test("sword history names the chosen opponent and administrator actions keep the actual actor", () => {
  const source = row("swords_reveal");
  source.metadata = { actorName: "Admin", actorIsAdmin: true, side: "a",
    ...log.choiceDetails({ rosterA: a, rosterB: b }, "a", 21, "sword", {
      swordAMemberId: 21, swordBMemberId: 11, swordAConfirmed: true, swordBConfirmed: true
    }) };
  const event = log.eventView(source, {}, a, b, null);
  assert.equal(event.actorRole, "admin");
  assert.equal(event.choice.playerName, "Bob");
  assert.deepEqual(event.revealedChoices.map(item => item.choice.playerName), ["Bob", "Alice"]);
});

function renderer(locale = "en") {
  const messages = require("../../public/i18n/" + locale + ".js");
  const t = (key, values = {}) => (messages[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name]);
  const escape = text => String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return new Function("t", "escapeHtml", "fmtDate", [
    "teamMatchPhaseLabel", "teamPairingLogMember", "teamPairingLogAssignment", "teamPairingLogEvent", "teamPairingLogMarkup"
  ].map(sourceOf).join("\n") + ";return teamPairingLogMarkup;")(t, escape, value => value);
}

test("the timeline explains who chose each Kill Team and table in English and Russian", () => {
  const revealed = log.eventView(row("shields_reveal"), {}, a, b, null);
  const table = { id: 51, type: "environment_select", at: revealed.at, actorName: "Jane", actorRole: "captain", rosterName: "Beta",
    kind: "table", slot: 1, assignments: [{ slot: 1, table: { number: 42, killzone: "Volkus", layout: 6 },
      playerA: { playerName: "Alice", faction: "Kasrkin" }, playerB: { playerName: "Bob", faction: "Novitiates" } }] };
  for (const locale of ["en", "ru"]) {
    const html = renderer(locale)([table, revealed]);
    assert.ok(html.indexOf('data-pairing-event="51"') < html.indexOf('data-pairing-event="50"'));
    for (const text of ["Captain at selection", "Jane", "Alice (Kasrkin)", "Bob (Novitiates)", "42", "Volkus", "6"]) assert.ok(html.includes(text), text);
    assert.ok(html.includes(locale === "ru" ? "Открыт щит" : "Shield revealed"));
    assert.ok(html.includes('datetime="2026-09-20T12:30:00.000Z"'));
  }
});

test("log text escapes user data and supports empty and old audit records", () => {
  const event = log.eventView(row("shields_reveal"), {}, a, b, null);
  event.actorName = '<img src=x onerror="alert(1)">';
  event.choice.playerName = "<script>attack</script>";
  const html = renderer()([event]);
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;img"));
  assert.match(renderer()([]), /No actions yet/);
  const legacy = log.eventView({ id: 1, event_type: "shield_select", actor_user_id: null, metadata: null, created_at: null }, {}, a, b, null);
  assert.doesNotThrow(() => renderer()([legacy]));
});

test("incoming log events retain the reader's position while a reader at the top sees the latest event", () => {
  for (const top of [0, 140]) {
    const old = { scrollTop: top, scrollHeight: 500 };
    let list = old;
    const preserve = new Function("document", sourceOf("preserveTeamPairingDrafts") + ";return preserveTeamPairingDrafts;")({
      querySelectorAll: selector => selector === "[data-team-pairing-log-list]" ? [list] : []
    });
    const restore = preserve();
    list = { scrollTop: 0, scrollHeight: 570 };
    restore();
    assert.equal(list.scrollTop, top ? 210 : 0);
  }
});
