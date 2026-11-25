const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = fs.readFileSync(path.join(__dirname, '../../public/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../../public/admin.js'), 'utf8');
function sourceOf(source, name) {
  const value = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\r?\\n\\}`))?.[0];
  assert.ok(value, name);
  return value;
}
test('all team formats share checkbox and priority controls, with WTC Doubles fixed', () => {
  const render = new Function('t', 'adminLabel', 'teamTiebreakerColumns', 'doublesTiebreakerDefaults', 'teamTiebreakerDefaults',
    `${sourceOf(app, 'teamTournamentTiebreakerFields')}; return teamTournamentTiebreakerFields;`)(key => key, ru => ru,
      { individual_wins: ['individualWins', 'wins'], strength_of_schedule: ['strengthOfSchedule', 'sos'], total_vp: ['totalVp', 'vp'], vp_diff: ['vpDiff', 'diff'], total_primary: ['totalPrimary', 'primary'] },
      ['strength_of_schedule', 'total_vp'], ['individual_wins', 'vp_diff', 'total_vp']);
  for (const [pairingType, count] of [['shield_sword', 4], ['sword_shield_classic', 4], ['doubles', 3], ['wtc_doubles', 3]]) {
    const html = render({ pairingType, id: 1 });
    assert.match(html, /data-standings-tiebreakers/);
    assert.match(html, /name="customTeamTiebreakers"/);
    assert.equal((html.match(/<select /g) || []).length, count);
    assert.equal(html.includes('value="total_primary"'), pairingType !== 'wtc_doubles');
    assert.ok(!html.includes('value="total_primary" selected'));
    if (pairingType === 'wtc_doubles') {
      assert.match(html, /checked disabled/);
      assert.equal((html.match(/disabled aria-readonly="true"/g) || []).length, 3);
      assert.match(html, />VP \+ Tac Op</);
    }
  }
});
test('custom-order checkbox hides and disables fields consistently without unlocking fixed formats', () => {
  const sync = new Function(`${sourceOf(app, 'syncTournamentTiebreakerFields')}; return syncTournamentTiebreakerFields;`)();
  const checkbox = { checked: false }, list = {}, selects = [{}, {}];
  const block = { dataset: {}, closest: () => null, querySelector: selector => selector.startsWith('input') ? checkbox : list,
    querySelectorAll: () => selects };
  const form = { querySelectorAll: () => [block] };
  sync(form);
  assert.equal(list.hidden, true); assert.ok(selects.every(select => select.disabled));
  checkbox.checked = true; sync(form);
  assert.equal(list.hidden, false); assert.ok(selects.every(select => !select.disabled));
  block.dataset.tiebreakerFixed = '1'; sync(form);
  assert.equal(checkbox.disabled, true); assert.ok(selects.every(select => select.disabled));
});
test('disabling individual custom order submits an empty order even though its fields are disabled', () => {
  const collect = new Function('setFormValue', `${sourceOf(admin, 'adminTournamentBodyFromForm')}; return adminTournamentBodyFromForm;`)(() => {});
  const body = collect({ dataset: {}, elements: { participantMode: { value: 'individual', disabled: true },
    customIndividualTiebreakers: { checked: false, disabled: false } }, querySelectorAll: () => [] });
  assert.deepEqual(body.tiebreakerOrder, []);
});
