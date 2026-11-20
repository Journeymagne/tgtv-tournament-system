import Ability from './Ability';
import {rolledFacePools} from './FaceDice';
import Model from './Model';

it('keeps original cursed threes separate from threes on a reroll', () => {
  const model = new Model().setProp('reroll', Ability.RerollOnes);
  const pools = rolledFacePools(1, model, true, true);
  expect(pools.find(row => row.cursed === 1)).toEqual({cursed: 1, fresh: [], rerolled: [], prob: 1 / 6});
  expect(pools.find(row => row.rerolled[0] === 3)?.prob).toBeCloseTo(1 / 36);
  expect(pools.some(row => row.fresh[0] === 3)).toBe(false);
});

it.each([Ability.Balanced, Ability.DoubleBalanced, Ability.RerollMostCommonFailPlusBalanced])(
  'preserves damage categories and reroll eligibility when numerical faces are unnecessary with %s', reroll => {
    const model = new Model(4, 4).setProp('lethal', 5).setProp('reroll', reroll);
    function grouped(keepFaces: boolean) {
      const groups = new Map<string, number>();
      for (const row of rolledFacePools(4, model, true, keepFaces)) {
        const key = [row.fresh, row.rerolled].map(dice =>
          dice.map(face => face >= 5 ? 'c' : face >= 4 ? 'n' : 'f').join('')).join('/') + row.cursed;
        groups.set(key, (groups.get(key) ?? 0) + row.prob);
      }
      return groups;
    }
    const detailed = grouped(true), compact = grouped(false);
    expect(compact.size).toBe(detailed.size);
    for (const [key, prob] of detailed) expect(compact.get(key)).toBeCloseTo(prob, 10);
    expect([...compact.values()].reduce((sum, prob) => sum + prob, 0)).toBeCloseTo(1, 10);
  },
);
