import fs from 'fs';
import path from 'path';

// Shooting rerolls target fails only. Melee crit-fishing is the Fight calculator Notes,
// not this section. See rules/WEAPON_RULES.md ("Reroll Targeting Strategy").
describe('WEAPON_RULES reroll targeting', () => {
  const doc = fs.readFileSync(path.join(process.cwd(), 'rules/WEAPON_RULES.md'), 'utf8').replace(/\r\n/g, '\n');
  const match = doc.match(/### Reroll Targeting Strategy\n([\s\S]*?)(?=\n### )/);
  const section = match ? match[1] : '';

  it('finds the Reroll Targeting Strategy section', () => {
    expect(section).not.toBe('');
  });

  it('calls fails-only the shooting default and points at the fight note for crit-fishing', () => {
    expect(section).toMatch(/\*\*Fails only\*\* is the shooting default/);
    expect(section).toMatch(/Crit-fishing is a fight choice/);
    expect(section).toMatch(/Fight calculator Notes/);
    expect(section).toMatch(/\[Fight calculator\]\(\/fight\/\)/);
    expect(section).not.toMatch(/This is optimal play/);
  });
});
