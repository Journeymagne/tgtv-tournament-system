const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
const maxBytes = require("../../src/domain/player-teams").TEAM_LOGO_MAX_BYTES;
const ru = require("../../public/i18n/ru");

function extract(name) {
  const body = source.match(new RegExp(`(?:async )?function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(body, name);
  return body;
}

function harness() {
  const resized = [];
  const handlers = {};
  const attributes = {};
  const input = { files: [], validity: "", setCustomValidity(value) { this.validity = value; },
    setAttribute: (name, value) => { attributes[name] = value; },
    addEventListener: (event, callback) => { handlers[event] = callback; } };
  const remove = { checked: false, addEventListener: (_event, callback) => { handlers.remove = callback; } };
  const message = { hidden: true, textContent: "" };
  const form = { elements: { logo: input, removeLogo: remove }, querySelector: () => message };
  const helpers = new Function("t", "resizeTournamentLogo", `${["teamLogoFileError", "wireTeamLogoValidation", "teamLogoFromForm"].map(extract).join("\n")}; return { wireTeamLogoValidation, teamLogoFromForm };`)(
    key => ru[key], async file => { resized.push(file); return "data:image/webp;base64,YQ=="; });
  helpers.wireTeamLogoValidation(form);
  return { input, message, attributes, remove, resized, read: () => helpers.teamLogoFromForm(form),
    select(file) { input.files = file ? [file] : []; handlers.change(); },
    toggleRemove(checked) { remove.checked = checked; handlers.remove(); } };
}

test("SD-10050069: oversize team logo immediately displays a 1 MB error and is not processed", async () => {
  const ui = harness();
  ui.select({ type: "image/png", size: maxBytes + 1 });
  assert.equal(ui.message.hidden, false);
  assert.equal(ui.message.textContent, ru["teams.logo.sizeError"]);
  assert.equal(ui.input.validity, ru["teams.logo.sizeError"]);
  assert.equal(ui.attributes["aria-invalid"], "true");
  await assert.rejects(ui.read(), { message: ru["teams.logo.sizeError"] });
  assert.equal(ui.resized.length, 0);
});

test("selecting a smaller image clears the error and accepts the exact server limit", async () => {
  const ui = harness();
  ui.select({ type: "image/png", size: maxBytes + 1 });
  ui.select({ type: "image/png", size: maxBytes });
  assert.equal(ui.message.hidden, true);
  assert.equal(ui.input.validity, "");
  assert.equal(ui.attributes["aria-invalid"], "false");
  assert.equal(await ui.read(), "data:image/webp;base64,YQ==");
  assert.equal(ui.resized.length, 1);
});

test("unsupported logo types show a team-specific error", async () => {
  const ui = harness();
  ui.select({ type: "image/svg+xml", size: 100 });
  assert.equal(ui.message.textContent, ru["teams.logo.typeError"]);
  await assert.rejects(ui.read(), { message: ru["teams.logo.typeError"] });
  assert.equal(ui.resized.length, 0);
});

test("clearing the selection keeps the existing logo unchanged", async () => {
  const ui = harness();
  ui.select({ type: "image/png", size: maxBytes + 1 });
  ui.select(null);
  assert.equal(ui.message.hidden, true);
  assert.equal(ui.input.validity, "");
  assert.equal(await ui.read(), undefined);
});

test("removal can clear an invalid selection; choosing a new file cancels removal", async () => {
  const ui = harness();
  ui.select({ type: "image/png", size: maxBytes + 1 });
  ui.toggleRemove(true);
  assert.equal(ui.input.validity, "");
  assert.equal(ui.message.hidden, true);
  assert.equal(await ui.read(), null);
  ui.toggleRemove(false);
  assert.equal(ui.message.hidden, false);
  ui.toggleRemove(true);
  ui.select({ type: "image/jpeg", size: 100 });
  assert.equal(ui.remove.checked, false);
  assert.equal(await ui.read(), "data:image/webp;base64,YQ==");
});
