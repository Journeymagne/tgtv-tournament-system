import {
  parseRelicMode,
  relicDiceCount,
  relicIgnoreProb,
  SaintlyRelicsInspiring,
  SaintlyRelicsNormal,
  SaintlyRelicsOff,
} from 'src/SaintlyRelics';

describe(parseRelicMode.name, () => {
  it('accepts the known modes', () => {
    expect(parseRelicMode('1')).toBe(SaintlyRelicsNormal);
    expect(parseRelicMode('2')).toBe(SaintlyRelicsInspiring);
  });
  it('falls back to off for missing, off, or malformed input', () => {
    expect(parseRelicMode(undefined)).toBe(SaintlyRelicsOff);
    expect(parseRelicMode('')).toBe(SaintlyRelicsOff);
    expect(parseRelicMode('0')).toBe(SaintlyRelicsOff);
    expect(parseRelicMode('5')).toBe(SaintlyRelicsOff);
    expect(parseRelicMode('2x')).toBe(SaintlyRelicsOff); // parseInt would have wrongly accepted "2"
    expect(parseRelicMode('1.5')).toBe(SaintlyRelicsOff);
  });
});

describe('relicDiceCount and relicIgnoreProb agree on what is active', () => {
  it('off/unknown => 0 dice and 0 ignore prob (engines never disagree)', () => {
    for (const mode of [SaintlyRelicsOff, 5, -1]) {
      expect(relicDiceCount(mode)).toBe(0);
      expect(relicIgnoreProb(mode)).toBe(0);
    }
  });
  it('normal => 1 die, 1/6; inspiring => 2 dice, 11/36', () => {
    expect(relicDiceCount(SaintlyRelicsNormal)).toBe(1);
    expect(relicIgnoreProb(SaintlyRelicsNormal)).toBeCloseTo(1 / 6, 10);
    expect(relicDiceCount(SaintlyRelicsInspiring)).toBe(2);
    expect(relicIgnoreProb(SaintlyRelicsInspiring)).toBeCloseTo(11 / 36, 10);
  });
});
