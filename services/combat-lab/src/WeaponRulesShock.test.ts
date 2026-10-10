import fs from 'fs';
import path from 'path';

// KT24 Shock discards one unresolved normal, or a critical success when the
// opponent has no unresolved normals. The section states that; the quick-reference
// table must say the same thing. See rules/WEAPON_RULES.md.
describe('WEAPON_RULES Shock text', () => {
  // Normalize line endings: a Windows checkout (core.autocrlf) has CRLF, and the section
  // regex below spans a line break.
  const doc = fs.readFileSync(path.join(process.cwd(), 'rules/WEAPON_RULES.md'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps the crit fallback in the Shock section', () => {
    expect(doc).toMatch(
      /### Shock\nThe first time you strike with a critical success in each sequence, also \*\*discard one of your opponent's unresolved normal successes\*\* \(or a critical success if there are none\)\./,
    );
  });

  it("table row matches the section: one of the opponent's unresolved normals, or a crit if none", () => {
    expect(doc).toMatch(
      /\| \*\*Shock\*\* \| First crit strike discards one of the opponent's unresolved normal successes \(or a crit if none\) \|/,
    );
    expect(doc).not.toMatch(/\| \*\*Shock\*\* \| First crit strike cancels enemy success \|/);
  });
});
