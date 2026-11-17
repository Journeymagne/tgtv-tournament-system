const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { readIndex, publishBackup, validateEntry } = require('../../scripts/create-release-backup');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kt-release-backups-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = day => {
    const id = `202611${day}T120000000Z-abcdef123456`, body = `backup-${day}`;
    fs.writeFileSync(path.join(root, id + '.dump'), body);
    return { id, file: id + '.dump', createdAt: `2026-11-${day}T12:00:00.000Z`,
      releaseId: id, commitSha: 'abcdef123456'.repeat(3) + 'abcd', version: '1.6.0',
      kind: 'release', bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex'), verification: 'fixture' };
  };
  return { root, entry };
}

test('publishes the two newest complete backups and prunes only indexed older files', t => {
  const f = fixture(t), first = f.entry('16'); publishBackup(f.root, first);
  const second = f.entry('17'); publishBackup(f.root, second);
  const third = f.entry('18'); fs.writeFileSync(path.join(f.root, 'unrelated.dump'), 'preserve');
  publishBackup(f.root, third);
  assert.deepEqual(readIndex(f.root).backups.map(e => e.id), [third.id, second.id]);
  assert.equal(fs.existsSync(path.join(f.root, first.file)), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'unrelated.dump'), 'utf8'), 'preserve');
  assert.equal(fs.existsSync(path.join(f.root, third.file)), true);
});

test('invalid or incomplete new backups leave the previous index and files intact', t => {
  const f = fixture(t), original = f.entry('17'); publishBackup(f.root, original);
  const before = fs.readFileSync(path.join(f.root, 'index.json'), 'utf8');
  const invalid = f.entry('18'); invalid.bytes += 1;
  assert.throws(() => publishBackup(f.root, invalid), /size/);
  assert.equal(fs.readFileSync(path.join(f.root, 'index.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(f.root, original.file)), true);
});

test('rejects traversal, malformed checksums, symlink roots and symlink dump files', t => {
  const f = fixture(t), entry = f.entry('17');
  assert.throws(() => validateEntry({ ...entry, file: '../private.dump' }), /manifest/);
  assert.throws(() => validateEntry({ ...entry, sha256: 'bad' }), /manifest/);
  const linked = path.join(f.root, 'linked'); fs.symlinkSync(f.root, linked, 'dir');
  assert.throws(() => readIndex(linked), /real directory/);
  fs.unlinkSync(path.join(f.root, entry.file)); fs.symlinkSync(path.join(f.root, 'outside'), path.join(f.root, entry.file));
  assert.throws(() => publishBackup(f.root, entry), /regular file/);
});

test('repeated publication is idempotent; damaged manifests never trigger deletions', t => {
  const f = fixture(t), entry = f.entry('17'); publishBackup(f.root, entry); publishBackup(f.root, entry);
  assert.equal(readIndex(f.root).backups.length, 1);
  fs.writeFileSync(path.join(f.root, 'index.json'), '{broken');
  assert.throws(() => publishBackup(f.root, f.entry('18')), /JSON|manifest/);
  assert.equal(fs.existsSync(path.join(f.root, entry.file)), true);
});
