const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planReleases, applyPlan, cleanupAfterDeploy } = require('../../scripts/prune-releases');

function fixture(t) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'tgtv-retention-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const app = path.join(parent, 'app'), root = app + '-releases';
  fs.mkdirSync(root);
  fs.mkdirSync(app + '-shared/work', { recursive: true });
  const ids = [1, 2, 3, 4, 5, 6].map(day => `2026110${day}T120000000Z-abcdef123456`);
  const release = (index, phase = 'healthy') => {
    const dir = path.join(root, ids[index]);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '.release.json'), JSON.stringify({ id: ids[index], phase }));
    fs.symlinkSync(app + '-shared/work', path.join(dir, 'work'), 'dir');
    return dir;
  };
  const activate = dir => { if (fs.existsSync(app)) fs.unlinkSync(app); fs.symlinkSync(dir, app, 'dir'); };
  return { app, root, ids, release, activate };
}

test('retains current and two previous healthy releases; removes abandoned preparations', t => {
  const f = fixture(t);
  const dirs = [f.release(0), f.release(1), f.release(2, 'preparing'), f.release(3), f.release(4, 'prepared'), f.release(5)];
  f.activate(dirs[5]);
  fs.writeFileSync(f.app + '-shared/work/persistent', 'keep');
  const plan = planReleases(f.app);
  assert.deepEqual(plan.remove.map(r => r.id), [f.ids[0], f.ids[2], f.ids[4]]);
  assert.deepEqual(plan.keep.map(r => r.id).sort(), [f.ids[1], f.ids[3], f.ids[5]]);
  const result = applyPlan(plan);
  assert.equal(result.deleted.length, 3);
  assert.equal(fs.readFileSync(f.app + '-shared/work/persistent', 'utf8'), 'keep');
  assert.equal(fs.readdirSync(f.root).length, 3);
  assert.equal(planReleases(f.app).remove.length, 0);
  assert.match(fs.readFileSync(f.app + '-shared/work/release-cleanup.jsonl', 'utf8'), /"event":"planned"/);
});

test('rollback retains predecessors of the current release rather than newer healthy copies', t => {
  const f = fixture(t), dirs = [0, 1, 2, 3, 4].map(i => f.release(i));
  f.activate(dirs[3]);
  const plan = planReleases(f.app);
  assert.deepEqual(plan.keep.map(r => r.id).sort(), f.ids.slice(1, 4));
  assert.deepEqual(plan.remove.map(r => r.id), [f.ids[0], f.ids[4]]);
});

test('protects PM2 cwd/script paths and physical runtime storage', t => {
  const f = fixture(t), dirs = [0, 1, 2, 3, 4, 5].map(i => f.release(i));
  f.activate(dirs[5]);
  fs.unlinkSync(path.join(dirs[0], 'work'));
  fs.mkdirSync(path.join(dirs[0], 'work'));
  const plan = planReleases(f.app, [path.join(dirs[1], 'server.js')]);
  assert.deepEqual(plan.remove.map(r => r.id), [f.ids[2]]);
  assert.match(plan.keep.find(r => r.id === f.ids[0]).reason, /physical work/);
  assert.match(plan.keep.find(r => r.id === f.ids[1]).reason, /process/);
});

test('skips symlinks, unknown entries and malformed or mismatched manifests', t => {
  const f = fixture(t), old = f.release(0), current = f.release(5);
  f.activate(current);
  fs.writeFileSync(path.join(old, '.release.json'), '{broken');
  const mismatch = f.release(1);
  fs.writeFileSync(path.join(mismatch, '.release.json'), JSON.stringify({ id: f.ids[2], phase: 'healthy' }));
  fs.mkdirSync(path.join(f.root, 'manual-backup'));
  fs.symlinkSync(f.app + '-shared', path.join(f.root, f.ids[3]), 'dir');
  const plan = planReleases(f.app);
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.skipped.length, 4);
});

test('refuses cleanup if current is not healthy or the release root is redirected', t => {
  const f = fixture(t), current = f.release(5, 'starting');
  f.activate(current);
  assert.throws(() => planReleases(f.app), /healthy/);
  fs.renameSync(f.root, f.root + '-moved');
  fs.symlinkSync(f.root + '-moved', f.root, 'dir');
  assert.throws(() => planReleases(f.app), /real directory/);
});

test('rechecks active link, candidate identity and newly protected paths before deletion', t => {
  const f = fixture(t), dirs = [0, 1, 2, 3].map(i => f.release(i));
  f.activate(dirs[3]);
  let plan = planReleases(f.app);
  assert.throws(() => applyPlan(plan, [path.join(dirs[0], 'server.js')]), /changed/);
  f.activate(dirs[2]);
  assert.throws(() => applyPlan(plan), /changed/);
  f.activate(dirs[3]);
  plan = planReleases(f.app);
  fs.renameSync(dirs[0], dirs[0] + '-original');
  fs.mkdirSync(dirs[0]);
  fs.writeFileSync(path.join(dirs[0], '.release.json'), JSON.stringify({ id: f.ids[0], phase: 'healthy' }));
  assert.throws(() => applyPlan(plan), /changed/);
  assert.equal(fs.existsSync(dirs[0]), true);
});

test('cleanup failure after deployment only warns and never fails the healthy deployment', async () => {
  const warnings = [];
  await cleanupAfterDeploy('/nonexistent/app', { warn: message => warnings.push(message) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Release cleanup skipped/);
});
