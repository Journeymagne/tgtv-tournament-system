const test = require('node:test');
const assert = require('node:assert/strict');
const { affected, selectedTests } = require('../../scripts/ci-plan');
test('tournament UI and release versions do not run unchanged calculator tests', () => {
  const plan = affected(['public/styles.css', 'public/map-catalog-ui.js', 'package.json', 'package-lock.json', 'public/index.html', 'src/http/seo.js']);
  assert.equal(plan.combat, false);
  assert.ok(plan.groups.includes('tournaments'));
});
test('domain checks include common guards and cross-service notification consumers', () => {
  const plan = affected(['public/training/questions-en.json']);
  assert.deepEqual(selectedTests(plan, ['test/unit/training-question-language.test.js', 'test/unit/http-io.test.js',
    'test/unit/studio-cloud.test.js', 'test/integration/api-notifications.test.js']),
  ['test/integration/api-notifications.test.js', 'test/unit/http-io.test.js', 'test/unit/training-question-language.test.js']);
  assert.equal(plan.combat, false);
});
test('calculator changes are isolated; workflow/runtime changes and unknown root code fail closed', () => {
  assert.deepEqual(affected(['services/combat-lab/src/App.tsx']), { groups: [], combat: true });
  assert.equal(affected(['.github/workflows/ci.yml']).combat, true);
  assert.equal(affected(['package.json'], { runtimeChanged: true }).combat, true);
  assert.equal(affected(['src/new-module.js']).groups.length, 6);
  assert.deepEqual(affected(['docs/deployment.md']), { groups: [], combat: false });
  assert.deepEqual(affected(['docs/documentation/ru/rules.md']), { groups: ['tournaments'], combat: false });
  assert.equal(affected([], { full: true }).groups.length, 6);
});
