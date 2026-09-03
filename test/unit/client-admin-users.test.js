const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appSource = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");

function functionSource(name, nextName) {
  return appSource.match(
    new RegExp(`function ${name}\\([^]*?\\r?\\n\\}(?=\\r?\\n\\r?\\nfunction ${nextName})`)
  )?.[0];
}

const filterSource = functionSource("filterAdminUsers", "adminUsersPanel");
const panelSource = functionSource("adminUsersPanel", "adminUsersResultsMarkup");

test("User administration filters players by nickname without case sensitivity", () => {
  assert.ok(filterSource, "could not find filterAdminUsers in public/app.js");
  const factory = new Function(`${filterSource}; return filterAdminUsers;`);
  const filterAdminUsers = factory();
  const users = [
    { id: 1, name: "ThunderFox" },
    { id: 2, name: "Громовой Волк" },
    { id: 3, name: "Night Owl" }
  ];

  assert.deepEqual(filterAdminUsers(users, "  THUNDER  ").map((user) => user.id), [1]);
  assert.deepEqual(filterAdminUsers(users, "волк").map((user) => user.id), [2]);
  assert.equal(filterAdminUsers(users, ""), users);
});

test("User administration renders a nickname search field with a localized hint", () => {
  assert.ok(panelSource, "could not find adminUsersPanel in public/app.js");
  assert.match(panelSource, /type="search"/);
  assert.match(panelSource, /data-admin-users-search/);
  assert.match(panelSource, /leaderboard\.users\.searchPlaceholder/);
  assert.match(panelSource, /leaderboard\.users\.searchHint/);
});
