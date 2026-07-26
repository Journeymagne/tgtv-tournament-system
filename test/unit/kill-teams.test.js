const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const {
  KILL_TEAMS,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS,
  KILLZONES,
  CRIT_OPS,
  LEGACY_NAMES,
  teamKey,
  canonicalKillTeam,
  requireKillTeam
} = require("../../src/domain/kill-teams");
const { ValidationError } = require("../../src/http/io");

// `ALIASES` is intentionally not exported (it's an internal implementation
// detail behind BY_KEY). The two invariants below must check the real map,
// not a second copy hand-copied into this test file — that would recreate
// exactly the "two vocabularies" bug this module exists to eliminate. So we
// recompile the module's own source in an isolated Module with one extra
// line that exposes ALIASES on its exports. The file on disk is untouched.
const KILL_TEAMS_SOURCE_PATH = path.join(__dirname, "../../src/domain/kill-teams.js");

function loadInternals() {
  const source = fs.readFileSync(KILL_TEAMS_SOURCE_PATH, "utf8");
  const patched = `${source}\nmodule.exports.ALIASES = ALIASES;\n`;
  const mod = new Module(KILL_TEAMS_SOURCE_PATH, module);
  mod.filename = KILL_TEAMS_SOURCE_PATH;
  mod.paths = Module._nodeModulePaths(path.dirname(KILL_TEAMS_SOURCE_PATH));
  mod._compile(patched, KILL_TEAMS_SOURCE_PATH);
  return mod.exports;
}

const { ALIASES } = loadInternals();

test("каждое каноническое имя нормализуется в себя", () => {
  for (const team of KILL_TEAMS) {
    assert.equal(canonicalKillTeam(team), team, `сломано на ${team}`);
  }
});

test("регистр и лишние пробелы не мешают", () => {
  assert.equal(canonicalKillTeam("  kasrkin  "), "Kasrkin");
  assert.equal(canonicalKillTeam("ANGELS OF DEATH"), "Angels of Death");
});

test("исторические написания приводятся к канону", () => {
  assert.equal(canonicalKillTeam("Tempestus Aquillons"), "Tempestus Aquilons");
  assert.equal(canonicalKillTeam("XV26 Stealth Suits"), "XV26 Stealth Battlesuits");
  assert.equal(canonicalKillTeam("Imperial Navy Breachers"), "Navy Breachers");
  assert.equal(canonicalKillTeam("Warp Coven"), "Warpcoven");
  assert.equal(canonicalKillTeam("Void Dancer Troupe"), "Void-Dancer Troupe");
  assert.equal(canonicalKillTeam("Angel of Death"), "Angels of Death");
});

test("варианты написания XV26 сходятся в одно имя", () => {
  for (const variant of [
    "Stealth Suits",
    "Stealth Battlesuits",
    "XV 26 Stealth Suits",
    "xv26 stealth battlesuit"
  ]) {
    assert.equal(canonicalKillTeam(variant), "XV26 Stealth Battlesuits", `сломано на ${variant}`);
  }
});

test("мусорный ввод не проходит", () => {
  assert.equal(canonicalKillTeam("Not A Real Team"), null);
  assert.equal(canonicalKillTeam(""), null);
  assert.equal(canonicalKillTeam(null), null);
});

test("requireKillTeam бросает ValidationError на мусоре", () => {
  assert.throws(() => requireKillTeam("Not A Real Team"), ValidationError);
  assert.equal(requireKillTeam("kasrkin"), "Kasrkin");
});

test("LEGACY_NAMES покрывает ровно расхождение старых словарей", () => {
  assert.equal(LEGACY_NAMES["Tempestus Aquillons"], "Tempestus Aquilons");
  assert.equal(LEGACY_NAMES["XV26 Stealth Suits"], "XV26 Stealth Battlesuits");
  for (const [from, to] of Object.entries(LEGACY_NAMES)) {
    assert.ok(KILL_TEAMS.includes(to), `цель ${to} должна быть в реестре`);
    assert.ok(!KILL_TEAMS.includes(from), `устаревшее ${from} не должно быть в реестре`);
  }
});

test("в реестре нет дубликатов", () => {
  assert.equal(new Set(KILL_TEAMS).size, KILL_TEAMS.length);
});

test("треки и wildcards без дубликатов внутри себя и не пересекаются друг с другом", () => {
  assert.equal(new Set(CLASSIFIED_TRACK).size, CLASSIFIED_TRACK.length, "дубликат внутри CLASSIFIED_TRACK");
  assert.equal(
    new Set(ALL_KILL_TEAM_TRACK).size,
    ALL_KILL_TEAM_TRACK.length,
    "дубликат внутри EXTRA_TRACK_TEAMS/CLASSIFIED_TRACK или пересечение между ними"
  );
  assert.equal(new Set(WILDCARDS).size, WILDCARDS.length, "дубликат внутри WILDCARDS");

  const wildcards = new Set(WILDCARDS);
  for (const team of ALL_KILL_TEAM_TRACK) {
    assert.ok(!wildcards.has(team), `${team} не может быть одновременно в треке и в wildcards`);
  }
});

test("ИНВАРИАНТ: 48 канонических имён дают 48 различных ключей", () => {
  // BY_KEY заполняется циклом по KILL_TEAMS: коллизия ключей молча
  // перезаписывает одно каноническое имя другим, без единой ошибки.
  assert.equal(KILL_TEAMS.length, 48, "ожидалось ровно 48 канонических имён в реестре");
  const keys = new Set(KILL_TEAMS.map(teamKey));
  assert.equal(
    keys.size,
    KILL_TEAMS.length,
    "два разных канонических имени нормализуются в один и тот же ключ — одно из них незаметно перезапишет другое в BY_KEY"
  );
});

test("ИНВАРИАНТ: все цели ALIASES существуют в реестре", () => {
  const registry = new Set(KILL_TEAMS);
  for (const [alias, target] of Object.entries(ALIASES)) {
    assert.ok(registry.has(target), `алиас "${alias}" указывает на несуществующую команду "${target}"`);
  }
});

test("ИНВАРИАНТ: алиасы не перекрывают чужие канонические имена", () => {
  for (const [alias, target] of Object.entries(ALIASES)) {
    const aliasKey = teamKey(alias);
    const collidingTeam = KILL_TEAMS.find((team) => teamKey(team) === aliasKey);
    if (collidingTeam) {
      assert.equal(
        collidingTeam,
        target,
        `алиас "${alias}" (ключ "${aliasKey}") перекрывает каноническое имя "${collidingTeam}", делая его недостижимым по собственному написанию`
      );
    }
  }
});

test("справочники killzone и crit op непусты и без дубликатов", () => {
  assert.ok(KILLZONES.includes("Volkus"));
  assert.ok(KILLZONES.includes("Tomb World"));
  assert.ok(CRIT_OPS.includes("Secure"));
  assert.equal(new Set(KILLZONES).size, KILLZONES.length);
  assert.equal(new Set(CRIT_OPS).size, CRIT_OPS.length);
});
