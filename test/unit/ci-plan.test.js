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
  assert.equal(affected(['src/new-module.js']).groups.length, 7);
  assert.deepEqual(affected(['docs/deployment.md']), { groups: [], combat: false });
  assert.deepEqual(affected(['docs/documentation/ru/rules.md']), { groups: ['tournaments'], combat: false });
  assert.equal(affected([], { full: true }).groups.length, 7);
});

test('tierlist edits select own service plus common guards without tournament dependency', () => {
  const plan = affected(['public/tierlist/tierlist.js', 'src/api/tierlists.js']);
  assert.deepEqual(plan.groups, ['tierlists']);
  assert.equal(plan.combat, false);
  assert.deepEqual(selectedTests(plan, ['test/integration/api-tierlists.test.js', 'test/unit/http-io.test.js',
    'test/integration/api-tournaments.test.js']), ['test/integration/api-tierlists.test.js','test/unit/http-io.test.js']);
});

test('provider changes select tournament regressions and the shared service boundary check', () => {
  const requiredTests = [
    'test/integration/api-tournament-provider-membership.test.js',
    'test/integration/service-boundaries.test.js',
    'test/unit/client-tournament-providers.test.js'
  ];
  for (const source of [
    'public/tournament-providers.js',
    'public/tournament-providers.css',
    'src/api/routes-tournament-providers.js',
    'src/api/tournament-provider-events.js',
    'src/api/tournament-providers.js',
    'src/db/repositories/tournament-providers.js',
    'src/domain/tournament-providers.js'
  ]) {
    const plan = affected([source]);
    assert.ok(plan.groups.includes('tournaments'), source);
    assert.equal(plan.combat, false, source);
    assert.deepEqual(selectedTests(plan, requiredTests), requiredTests, source);
  }
});

test('shared authorization and provider database changes select every root service', () => {
  for (const source of [
    'src/api/authorization.js',
    'src/db/repositories/access.js',
    'src/db/migrations/116_tournament_providers.js'
  ]) {
    assert.deepEqual(affected([source]), {
      groups: ['accounts', 'faq', 'knowthykt', 'notifications', 'studio', 'tierlists', 'tournaments'],
      combat: false
    }, source);
  }
});
