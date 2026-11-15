const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('../../public/map-catalog');
const { parseKillzone } = require('../../src/domain/scoring');

test('every catalog image exists and matches its recorded digest', () => {
  assert.equal(catalog.maps.length, 67);
  const keys = new Set();
  for (const map of catalog.maps) {
    const key = `${map.set}:${map.slot}`;
    assert.ok(!keys.has(key)); keys.add(key);
    const image = fs.readFileSync(path.join(__dirname, '../../public', decodeURIComponent(map.imageUrl)));
    assert.equal(crypto.createHash('sha256').update(image).digest('hex'), map.sha256);
    assert.equal(parseKillzone({ killzone: map.set, layout: map.slot }).layout, map.slot);
  }
});
test('editions and printed WTC numbering resolve without guessing legacy Volkus', () => {
  assert.notEqual(catalog.find({killzone:'Volkus 2024',layout:1}).imageUrl, catalog.find({killzone:'Volkus 2025',layout:1}).imageUrl);
  assert.equal(catalog.find({killzone:'Volkus',layout:1}), undefined);
  assert.equal(catalog.find({killzone:'WTC Open 2025',layout:6}).number, '6.2');
});
test('extended layouts are valid only in the Squad Games set', () => {
  assert.equal(parseKillzone({killzone:'Squad-Games Gallowdark+',layout:13}).layout, 13);
  for (const killzone of ['Volkus 2025', 'Gallowdark', '']) {
    assert.throws(() => parseKillzone({killzone,layout:7}));
  }
  assert.throws(() => parseKillzone({killzone:'Squad-Games Gallowdark+',layout:14}));
  assert.throws(() => parseKillzone({killzone:'Squad-Games Gallowdark+',layout:1.1}));
});
