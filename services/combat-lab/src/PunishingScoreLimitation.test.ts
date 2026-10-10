import fs from 'fs';
import path from 'path';
import { Punishing } from 'src/Notes';

// The shoot retain score weighs saves, cover, and Piercing, and skips Feel No Pain and
// Saintly Relics. The Punishing hover and the retained-dice limitations have to say so;
// the Mystic Scry note already does.
const SENTENCE = /The shoot score includes saves, cover, and Piercing, and does not include Feel No Pain or Saintly Relics/;

describe('save-aware retain score limitations', () => {
  it('Punishing hover says the shoot score skips Feel No Pain and Saintly Relics', () => {
    expect(Punishing.description).toMatch(SENTENCE);
  });

  it('retained-dice limitations say the shoot score skips Feel No Pain and Saintly Relics', () => {
    const doc = fs.readFileSync(
      path.join(process.cwd(), 'rules/RETAINED_VS_MODIFIED_DICE.md'),
      'utf8',
    );
    const start = doc.indexOf('## Known modelling limitations');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(doc.slice(start).replace(/\s+/g, ' ')).toMatch(SENTENCE);
  });
});
