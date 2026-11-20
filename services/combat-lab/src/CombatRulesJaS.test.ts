import fs from 'fs';
import path from 'path';

describe('Just a Scratch on the in-app combat rules page', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'rules/COMBAT_RULES.md'), 'utf8');
  const section = doc.split(/^### Just a Scratch\r?$/m)[1]?.split(/^### /m)[0] ?? '';

  it('limits protection to one unblocked normal die and resolves other damage', () => {
    expect(section).toMatch(/normal damage of one unblocked attack die/i);
    expect(section).toMatch(/critical damage and separately inflicted devastating damage still resolve/i);
    expect(doc).not.toMatch(/^### Just a Scratch \(Crits\)/mi);
  });

  it('keeps a once-per-series use available until a normal die would deal damage', () => {
    expect(section).toMatch(/one use available.+carries forward until a normal die would deal damage/i);
  });
});
