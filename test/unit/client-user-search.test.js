const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = ["app.js", "admin.js"].map(file => fs.readFileSync(path.join(__dirname, "../../public", file), "utf8")).join("\n");
function load(name) {
  const body = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`, "m"))?.[0];
  assert.ok(body, `Missing ${name}`);
  return new Function(`${body}; return ${name};`)();
}

test("shared player lookup matches User administration for partial nicknames", () => {
  const matches = load("userSearchMatches");
  const adminFilter = load("filterAdminUsers");
  const users = [
    { id: 1, name: "Thunder.Fox" }, { id: 2, name: "Громовой Волк" },
    { id: 3, name: "Night [Owl]" }, { id: 4, name: "Other" }
  ];
  for (const query of ["", "  THUNDER  ", "воЛК", "[owl]", ".", "not found"]) {
    assert.deepEqual(users.filter(user => matches(user.name, query)), adminFilter(users, query));
  }
});

test("player search keeps IDs distinct for matching nicknames and handles missing ratings", () => {
  const items = load("userComboItems")([
    { id: 11, name: "Twin", rating: 1000 }, { id: 12, name: "Twin", rating: 1000 },
    { id: 13, name: "No Rating", registerNickname: "contact" }
  ]);
  assert.deepEqual(items.map(item => item.value), ["11", "12", "13"]);
  assert.equal(items[0].label, items[1].label);
  assert.equal(items[2].label, "No Rating");
  assert.deepEqual(items.map(item => item.search), ["Twin", "Twin", "No Rating"]);
});
