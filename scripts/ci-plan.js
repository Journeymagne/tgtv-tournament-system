const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const GROUPS = ['accounts', 'notifications', 'tournaments', 'studio', 'faq', 'knowthykt'];

function testGroup(file) {
  const name = path.basename(file);
  if (/studio/.test(name)) return 'studio';
  if (/training/.test(name)) return 'knowthykt';
  if (/faq/.test(name)) return 'faq';
  if (/notifications/.test(name)) return 'notifications';
  if (/auth|admin-users|api-admin|api-users|repositories-users|email|passwords|session-renewal|access-roles/.test(name)) return 'accounts';
  if (/tournament|team|roster|elo|game|challenge|scoring|standings|achievement|pairing|doubles|solo-replacements|table-images|documentation/.test(name)) return 'tournaments';
  return 'shared';
}
function affected(files, { full = false, runtimeChanged = false } = {}) {
  const groups = new Set();
  let combat = full || runtimeChanged;
  const all = () => GROUPS.forEach(group => groups.add(group));
  if (full) all();
  for (const file of files) {
    if (/^services\/combat-lab\//.test(file)) { combat = true; continue; }
    // These documents are served by the application, unlike developer guides.
    if (/^docs\/documentation\//.test(file)) { groups.add('tournaments'); continue; }
    if (/^(docs\/|review\/|design\/)|^(README|CHANGELOG|AGENTS)\.md$/.test(file)) continue;
    if (/^(\.github\/workflows\/|scripts\/(?:ci-plan|.*combat.*|dependency-state)\.js$)|^Dockerfile/.test(file)) {
      all(); combat = true; continue;
    }
    if (/^test\/(unit|integration)\/.*\.test\.js$/.test(file)) {
      const group = testGroup(file);
      if (group === 'shared') all(); else groups.add(group);
      continue;
    }
    if (/^(public\/training\/|src\/training\/|src\/api\/(?:training|routes-knowthykt))/.test(file)) {
      groups.add('knowthykt'); groups.add('notifications'); continue;
    }
    if (/^(public\/(?:studio|dice)\/|src\/api\/(?:studio|routes-studio)|src\/domain\/studio|src\/db\/repositories\/studio)/.test(file)) {
      groups.add('studio'); groups.add('notifications'); continue;
    }
    if (/^(public\/faq\/|src\/api\/(?:faq|routes-faq)|src\/db\/repositories\/faq)/.test(file)) {
      groups.add('faq'); groups.add('accounts'); groups.add('notifications'); continue;
    }
    if (/^(src\/(?:api|domain|db\/repositories)\/(?:tournament|team-|player-team|challenge|game|achievement|elo|scoring|pairing|solo-|standings)|public\/(?:app\.js|admin\.js|styles\.css|map-catalog|maps\/|tournament-|pairing-|telegram-account))/.test(file)) {
      groups.add('tournaments'); groups.add('accounts'); groups.add('notifications'); continue;
    }
    // Unknown code and shared auth/database contracts conservatively run all
    // root services. Combat Lab owns its separate dependencies and test suite.
    all();
  }
  return { groups: [...groups].sort(), combat };
}
function selectedTests(plan, files) {
  return files.filter(file => plan.groups.length && (testGroup(file) === 'shared' || plan.groups.includes(testGroup(file)))).sort();
}
function git(...args) { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
function eventPlan() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') return affected([], { full: true });
  try {
    let base = event.pull_request?.base.sha || event.before;
    if (process.env.GITHUB_REF?.startsWith('refs/heads/release/')) base = git('merge-base', 'origin/main', 'HEAD');
    if (!base || /^0+$/.test(base)) base = git('merge-base', 'origin/main', 'HEAD');
    const files = git('diff', '--name-only', '--no-renames', base, 'HEAD').split('\n').filter(Boolean);
    if (!files.length) return affected([], { full: true });
    const previous = JSON.parse(git('show', `${base}:package.json`));
    const current = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    return affected(files, { runtimeChanged: JSON.stringify(previous.engines) !== JSON.stringify(current.engines) });
  } catch { return affected([], { full: true }); }
}
if (require.main === module) {
  if (process.argv[2] === '--run') {
    const files = JSON.parse(process.env.CI_TEST_FILES || '[]');
    if (!files.length || files.some(file => !/^test\/(unit|integration)\/[\w.-]+\.test\.js$/.test(file))) throw Error('Invalid CI test selection');
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } else {
    const plan = eventPlan();
    const files = ['unit', 'integration'].flatMap(group => fs.readdirSync(`test/${group}`)
      .filter(file => file.endsWith('.test.js')).map(file => `test/${group}/${file}`));
    const tests = selectedTests(plan, files);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `root=${tests.length > 0}\ncombat=${plan.combat}\ntests=${JSON.stringify(tests)}\n`);
    console.log(JSON.stringify({ ...plan, testFiles: tests.length }));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `Selected services: ${plan.groups.join(', ') || 'none'}\n\nRoot test files: ${tests.length}; Combat Lab: ${plan.combat ? 'run' : 'unchanged'}\n`);
  }
}
module.exports = { affected, selectedTests, testGroup };
