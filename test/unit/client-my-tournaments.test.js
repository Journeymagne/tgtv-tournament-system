const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const renderSource = source.match(/function tournamentListSections\([^]*?\r?\n\}/)[0];
const render = new Function("state", "t", "escapeHtml", "publicTournamentCard", "paginationMarkup",
  `${renderSource}; return tournamentListSections;`)({ tournamentListExpanded: {} }, key => key, String,
  tournament => `<article>${tournament.name}</article>`, target => `<nav>${target}</nav>`);

test("personal section appears before current and future tournaments with its own count and pagination", () => {
  const html = render([{ name: "Public", status: "in_progress" }], {
    mine: [{ name: "Owned cup", status: "registration_open" }], minePagination: { total: 24 }
  });
  assert.ok(html.indexOf("tournaments.section.mine") < html.indexOf("tournaments.section.ongoing"));
  assert.ok(html.indexOf("tournaments.section.mine") < html.indexOf("tournaments.section.future"));
  assert.match(html, /<span>24<\/span>/);
  assert.match(html, /<article>Owned cup<\/article>/);
  assert.match(html, /<nav>my-tournaments<\/nav>/);
});

test("personal section supports empty public lists and is absent from guest and admin lists", () => {
  assert.match(render([], { mine: [{ name: "Cup", status: "in_progress" }] }), /<article>Cup<\/article>/);
  assert.match(render([], { mine: [] }), /tournaments.section.mine/);
  const tournaments = [{ name: "Public", status: "in_progress" }];
  assert.doesNotMatch(render(tournaments), /tournaments.section.mine/);
  assert.doesNotMatch(render(tournaments, { admin: true, mine: tournaments }), /tournaments.section.mine/);
});

test("sections collapse independently, Ended starts closed, and choices survive rerendering", () => {
  const tournaments = [{ name: "Finished cup", status: "completed" }];
  const html = render(tournaments, { mine: [] });
  for (const id of ["mine", "ongoing", "future"]) {
    assert.match(html, new RegExp(`data-tournament-list-section="public-${id}" open>`));
  }
  assert.match(html, /data-tournament-list-section="public-ended"\s*>/);
  assert.match(html, /<summary class="tournament-list-heading">/);
  assert.match(html, /<article>Finished cup<\/article>/);
  const changed = render(tournaments, { mine: [], expanded: { "public-mine": false, "public-ended": true } });
  assert.match(changed, /data-tournament-list-section="public-mine"\s*>/);
  assert.match(changed, /data-tournament-list-section="public-ended" open>/);
});
