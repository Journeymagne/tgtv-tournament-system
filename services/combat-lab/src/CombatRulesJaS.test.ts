import fs from 'fs';
import path from 'path';

// rules/COMBAT_RULES.md is the in-app /rules/combat page. Just a Scratch (Crits)
// used to say it always prefers crits; the shoot engine (calcDamage) tries both
// dice and keeps the lower damage. This locks that wording so the page cannot
// drift back from the note and the checkbox title.
describe('COMBAT_RULES Just a Scratch (Crits)', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'rules/COMBAT_RULES.md'), 'utf8');
  const start = doc.indexOf('### Just a Scratch (Crits)');
  const rest = start >= 0 ? doc.slice(start) : '';
  const next = rest.indexOf('\n### ', 1);
  const section = next >= 0 ? rest.slice(0, next) : rest;

  it('describes choosing the die that leaves less damage', () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(section).toMatch(/saves the most damage/i);
    expect(section).toMatch(/keeps the lower damage/i);
    expect(section).toMatch(/does not always drop the crit/i);
    expect(section).toMatch(/before saves/i);
  });

  it('does not say it prefers crits and falls back to a normal', () => {
    expect(section).not.toMatch(/prefers crits/i);
    expect(section).not.toMatch(/falls back to cancel/i);
  });
});
