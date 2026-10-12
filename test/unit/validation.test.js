const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeName,
  requireName,
  profileText,
  requiredProfileText,
  validateAvatarData,
  scoreInput,
  primaryInput,
  aplInput,
  optionalTextInput
} = require("../../src/domain/validation");
const { ValidationError } = require("../../src/http/io");

test("normalizeName схлопывает пробелы", () => {
  assert.equal(normalizeName("  Alpha   Bravo "), "Alpha Bravo");
  assert.equal(normalizeName(null), "");
});

test("requireName принимает буквы, цифры и ._-", () => {
  assert.equal(requireName(" Alpha_1.2-3 "), "Alpha_1.2-3");
  assert.equal(requireName("Кириллица"), "Кириллица");
});

test("requireName отвергает слишком короткое и слишком длинное", () => {
  assert.throws(() => requireName("A"), ValidationError);
  assert.throws(() => requireName("x".repeat(25)), ValidationError);
  assert.throws(() => requireName("bad!name"), ValidationError);
});

test("profileText режет по длине", () => {
  assert.equal(profileText("  a  b ", "Field", 40), "a b");
  assert.throws(() => profileText("x".repeat(41), "Field", 40), ValidationError);
});

test("requiredProfileText требует непустое значение", () => {
  assert.throws(() => requiredProfileText("", "Telegram Contact", 80), ValidationError);
  assert.equal(requiredProfileText(" @user ", "Telegram Contact", 80), "@user");
});

test("validateAvatarData принимает data URL и пустое значение", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(validateAvatarData(png), png);
  assert.equal(validateAvatarData(null), null);
  assert.equal(validateAvatarData(""), null);
});

test("validateAvatarData отвергает не-картинки и переросшие", () => {
  assert.throws(() => validateAvatarData("https://example.com/a.png"), ValidationError);
  assert.throws(() => validateAvatarData(123), ValidationError);
  assert.throws(
    () => validateAvatarData(`data:image/png;base64,${"A".repeat(1024 * 1024 + 10)}`),
    ValidationError
  );
});

test("scoreInput ограничен диапазоном 0..6", () => {
  assert.equal(scoreInput(0), 0);
  assert.equal(scoreInput("6"), 6);
  assert.throws(() => scoreInput(7), ValidationError);
  assert.throws(() => scoreInput(-1), ValidationError);
  assert.throws(() => scoreInput(2.5), ValidationError);
  assert.throws(() => scoreInput(undefined), ValidationError);
});

test("primaryInput принимает только три значения", () => {
  assert.equal(primaryInput("crit"), "crit");
  assert.throws(() => primaryInput("other"), ValidationError);
});

test("aplInput ограничен диапазоном 0..99", () => {
  assert.equal(aplInput("12"), 12);
  assert.throws(() => aplInput(100), ValidationError);
});

test("optionalTextInput режет по длине", () => {
  assert.equal(optionalTextInput("  x ", "Tac Op"), "x");
  assert.throws(() => optionalTextInput("x".repeat(81), "Tac Op"), ValidationError);
});
