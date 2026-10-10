import { HalfDamageFirstStrike } from 'src/Notes';

// The Fight checkbox title is this note (FighterControls sets title={note.description}).
// The engine leaves a strike of 0, 1, or 2 unchanged and halves a larger strike
// rounded up, which does not raise it (dmg <= 2 ? dmg : ceil(dmg / 2)).
describe('HalfDamageFirstStrike hover title', () => {
  const title = HalfDamageFirstStrike.description ?? '';

  it('says the strike is halved and rounded up, that 0, 1, and 2 stay, and that a larger strike is not raised', () => {
    expect(title).toMatch(/halved and rounded up/i);
    expect(title).toMatch(/0, 1, and 2 stay as they are/);
    expect(title).toMatch(/a larger strike is not raised/);
  });

  it('does not say the strike is never below 2 or raised to a minimum of 2', () => {
    expect(title).not.toMatch(/never below 2/);
    expect(title).not.toMatch(/minimum of 2/);
  });
});
