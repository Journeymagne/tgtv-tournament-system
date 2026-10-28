const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const renderSource = source.match(/function tournamentListSections\([^]*?\r?\n\}/)[0];
const render = new Function("t", "escapeHtml", "publicTournamentCard", "paginationMarkup",
  `${renderSource}; return tournamentListSections;`)(key => key, String,
  tournament => `<article>${tournament.name}</article>`, target => `<nav>${target}</nav>`);

test("personal section appears before current and future tournaments with its own count and pagination", () => {
  const html = render([{ name: "Public", status: "in_progress" }], {
    mine: [{ name: "Owned draft", status: "draft" }], minePagination: { total: 24 }
  });
  assert.ok(html.indexOf("tournaments.section.mine") < html.indexOf("tournaments.section.ongoing"));
  assert.ok(html.indexOf("tournaments.section.mine") < html.indexOf("tournaments.section.future"));
  assert.match(html, /<span>24<\/span>/);
  assert.match(html, /<article>Owned draft<\/article>/);
  assert.match(html, /<nav>my-tournaments<\/nav>/);
});

test("personal section supports empty public lists and is absent from guest and admin lists", () => {
  assert.match(render([], { mine: [{ name: "Draft" }] }), /<article>Draft<\/article>/);
  assert.match(render([], { mine: [] }), /tournaments.section.mine/);
  const tournaments = [{ name: "Public", status: "in_progress" }];
  assert.doesNotMatch(render(tournaments), /tournaments.section.mine/);
  assert.doesNotMatch(render(tournaments, { admin: true, mine: tournaments }), /tournaments.section.mine/);
});
