const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "../../public/app.js"), "utf8");
function extract(name) {
  const result = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(result, name);
  return result;
}

function comboHarness() {
  class Element extends EventTarget {
    dataset = {};
    attributes = {};
    value = "";
    innerHTML = "";
    hidden = false;
    classes = new Set();
    classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name) };
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    setCustomValidity(value) { this.validationMessage = value; }
    scrollIntoView() {}
  }
  const input = new Element(), value = new Element(), menu = new Element(), toggle = new Element(), combo = new Element();
  const document = new Element();
  document.querySelectorAll = () => [combo];
  input.focus = () => {
    if (document.activeElement !== input) {
      document.activeElement = input;
      input.dispatchEvent(new Event("focus"));
    }
  };
  const options = [
    { value: "11", label: "Notthefallen · Celestian Insidiants", search: "Notthefallen" },
    { value: "12", label: "Player032 (Kasrkin)", search: "Player032" },
    { value: "13", label: "Player053 (Sanctifiers)", search: "Player053" }
  ];
  combo.dataset = { comboOptions: "users", comboValueMode: "value", comboItems: JSON.stringify(options) };
  combo.contains = (element) => [combo, input, value, menu, toggle].includes(element);
  combo.querySelector = (selector) => ({ "[data-combo-input]": input, "[data-combo-value-input]": value, "[data-combo-menu]": menu, "[data-combo-toggle]": toggle })[selector];
  input.value = options[0].label;
  value.value = options[0].value;
  menu.id = "options";
  menu.hidden = true;
  menu.querySelectorAll = () => [...menu.innerHTML.matchAll(/data-combo-value="([^"]+)"/g)].map((match) => Object.assign(new Element(), { dataset: { comboValue: match[1] } }));
  Object.defineProperty(menu, "children", { get: () => menu.querySelectorAll() });
  const names = ["wireComboFields", "comboOptionsFor", "normalizeComboOptions", "comboOptionValue", "comboOptionLabel", "comboOptionSearchText", "userSearchMatches"];
  const wire = new Function("document", "window", "t", "escapeHtml", `
    const enhanceUserSelects = () => {};
    const comboOptionStartsWithQuery = (option, query) => option.label.toLowerCase().startsWith(query.toLowerCase());
    ${names.map(extract).join("\n")}; return wireComboFields;
  `)(document, { setTimeout: (fn) => fn() }, (key) => key, String);
  wire();
  return {
    input, value, menu, combo, toggle, options,
    shown: () => menu.querySelectorAll().map((option) => option.dataset.comboValue),
    key: (key) => input.dispatchEvent(Object.assign(new Event("keydown", { cancelable: true }), { key })),
    type: (text) => { input.value = text; input.dispatchEvent(new Event("input")); }
  };
}

test("clicking a selected player label opens the same full list as the arrow without clearing selection", () => {
  const ui = comboHarness();
  ui.input.focus();
  ui.input.dispatchEvent(new Event("click"));
  assert.deepEqual(ui.shown(), ["11", "12", "13"]);
  assert.equal(ui.input.value, ui.options[0].label);
  assert.equal(ui.value.value, "11");
  assert.equal(ui.input.validationMessage, "");
  ui.key("Escape");
  ui.toggle.dispatchEvent(new Event("click"));
  assert.deepEqual(ui.shown(), ["11", "12", "13"]);
});

test("keyboard navigation keeps the open list and clicking the still-focused input reopens it after selection", () => {
  const ui = comboHarness();
  ui.input.focus();
  ui.key("ArrowDown");
  ui.key("ArrowDown");
  assert.deepEqual(ui.shown(), ["11", "12", "13"]);
  ui.key("Enter");
  assert.equal(ui.value.value, "12");
  assert.equal(ui.input.value, ui.options[1].label);
  assert.equal(ui.menu.hidden, true);
  ui.input.dispatchEvent(new Event("click"));
  assert.equal(ui.menu.hidden, false);
  assert.deepEqual(ui.shown(), ["11", "12", "13"]);
});

test("typing still filters by nickname or visible label, preserves the filter on option updates, and reports genuine misses", () => {
  const ui = comboHarness();
  ui.input.focus();
  ui.type("sanct");
  assert.deepEqual(ui.shown(), ["13"]);
  assert.equal(ui.value.value, "");
  ui.combo.dispatchEvent(new Event("combo-options-change"));
  ui.key("ArrowDown");
  assert.deepEqual(ui.shown(), ["13"]);
  ui.key("Enter");
  assert.equal(ui.value.value, "13");
  ui.type("  PLAYER03  ");
  assert.deepEqual(ui.shown(), ["12"]);
  ui.type("definitely absent");
  assert.match(ui.menu.innerHTML, /common.noMatches/);
  ui.type(ui.options[0].label);
  assert.deepEqual(ui.shown(), ["11"]);
  assert.equal(ui.value.value, "11");
});
