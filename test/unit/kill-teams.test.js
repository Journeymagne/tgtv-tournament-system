const test = require("node:test");
const assert = require("node:assert/strict");

const {
  KILL_TEAMS,
  CLASSIFIED_TRACK,
  ALL_KILL_TEAM_TRACK,
  WILDCARDS,
  KILLZONES,
  CRIT_OPS,
  LEGACY_NAMES,
  canonicalKillTeam,
  requireKillTeam
} = require("../../src/domain/kill-teams");
const { ValidationError } = require("../../src/http/io");

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

test("треки и wildcards не пересекаются", () => {
  const wildcards = new Set(WILDCARDS);
  for (const team of ALL_KILL_TEAM_TRACK) {
    assert.ok(!wildcards.has(team), `${team} не может быть одновременно в треке и в wildcards`);
  }
});

test("классифицированный трек — подмножество полного", () => {
  const all = new Set(ALL_KILL_TEAM_TRACK);
  for (const team of CLASSIFIED_TRACK) {
    assert.ok(all.has(team), `${team} отсутствует в полном треке`);
  }
});

test("ИНВАРИАНТ: треки и wildcards в точности покрывают реестр", () => {
  const covered = new Set([...ALL_KILL_TEAM_TRACK, ...WILDCARDS]);
  const registry = new Set(KILL_TEAMS);

  const missing = [...registry].filter((team) => !covered.has(team));
  const extra = [...covered].filter((team) => !registry.has(team));

  assert.deepEqual(missing, [], "команды реестра, не попавшие ни в один трек");
  assert.deepEqual(extra, [], "команды треков, отсутствующие в реестре");
});

test("справочники killzone и crit op непусты и без дубликатов", () => {
  assert.ok(KILLZONES.includes("Volkus"));
  assert.ok(KILLZONES.includes("Tomb World"));
  assert.ok(CRIT_OPS.includes("Secure"));
  assert.equal(new Set(KILLZONES).size, KILLZONES.length);
  assert.equal(new Set(CRIT_OPS).size, CRIT_OPS.length);
});
