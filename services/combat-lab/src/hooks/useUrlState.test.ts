import { getStateFromUrl } from './useUrlState';

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe.each(['a1', 'a2'])('shared shooting profile %s', (key) => {
  it.each([
    [0, 0],
    [0, 4],
    [3, 0],
    [3, 4],
  ])('preserves damage %i/%i in both URL formats', (normal, critical) => {
    for (const suffix of ['', '0:0:0:']) {
      const params = new URLSearchParams({
        view: 'shoot',
        [key]: `4:3:${normal}:${critical}:0:0:0:X:0:0:${suffix}`,
      });
      window.history.replaceState({}, '', `/?${params}`);
      const state = getStateFromUrl();
      const attacker = (key === 'a1' ? state.s1 : state.s2)!.attacker;
      expect([attacker.normDmg, attacker.critDmg]).toEqual([normal, critical]);
    }
  });

  it.each(['', 'invalid'])('uses default damage for invalid values %j', (value) => {
    const params = new URLSearchParams({
      [key]: `4:3:${value}:${value}:0:0:0:X:0:0:0:0:0:`,
    });
    window.history.replaceState({}, '', `/?${params}`);
    const state = getStateFromUrl();
    const attacker = (key === 'a1' ? state.s1 : state.s2)!.attacker;
    expect([attacker.normDmg, attacker.critDmg]).toEqual([3, 4]);
  });
});
