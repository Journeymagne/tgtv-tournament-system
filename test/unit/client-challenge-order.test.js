const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildChallengeTracks } = require("../../src/domain/challenge-progress");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");

function extract(name) {
  const result = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
}

test("карточки повторяют порядок и статусы серверного трека", () => {
  const progress = { tracks: buildChallengeTracks([], { id: 1 }) };
  const state = { challengeTab: "allKillTeam" };
  const select = new Function("state", `${extract("challengeTrackProgress")}; return challengeTrackProgress;`)(state);
  assert.strictEqual(select(progress), progress.tracks.allKillTeam);
  state.challengeTab = "classified";
  assert.strictEqual(select(progress), progress.tracks.classified);
});

test("у администратора нет кнопки зачёта заблокированной команды", () => {
  const render = new Function("t", "escapeHtml", "fmtDate", "canEditChallengeProgress", "killTeamLogoSrc", "killTeamLogoAttrs",
    `${extract("challengeTeamCard")}; return challengeTeamCard;`
  )((key) => key, String, String, () => true, () => "logo.webp", () => "");
  const card = (status) => render({ team: "Kasrkin", order: 1, status }, false, 1);
  assert.doesNotMatch(card("locked"), /data-credit-team=/);
  assert.match(card("current"), /data-credit-team=/);
  assert.match(card("available"), /data-credit-team=/);
  assert.match(card("completed"), /data-remove-credit-team=/);
});
