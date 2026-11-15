import fs from 'fs';
import path from 'path';

// The Severe changelog entry must name the function that owns severeTriggered.
// Line numbers drift, and FailToNormIfCrit is not the current ability name.
// See rules/WEAPON_RULES.md ("Severe Rule Fix").
describe('WEAPON_RULES Severe source citation', () => {
  // Normalize line endings: a Windows checkout (core.autocrlf) has CRLF, and the section
  // regex below spans a line break.
  const doc = fs.readFileSync(path.join(process.cwd(), 'rules/WEAPON_RULES.md'), 'utf8').replace(/\r\n/g, '\n');
  const match = doc.match(/### Severe Rule Fix\n([\s\S]*?)(?=\n### )/);
  const section = match ? match[1] : '';

  it('finds the Severe Rule Fix section', () => {
    expect(section).not.toBe('');
  });

  it('does not cite lines 177-198 or FailToNormIfCrit', () => {
    expect(section).not.toMatch(/lines 177-198/);
    expect(section).not.toMatch(/FailToNormIfCrit/);
  });

  it('names severeTriggered inside resolveAfterPunishing', () => {
    expect(section).toMatch(/`severeTriggered` in `resolveAfterPunishing`/);
  });
});
