import DieProbs from 'src/DieProbs';
import Ability from 'src/Ability';

describe('DieProbs.fromSkills lethal vs hit-skill', () => {
  it('BS=4+, no lethal: 1/6 crit (nat 6), 2/6 norm', () => {
    const p = DieProbs.fromSkills(6, 4, Ability.None);
    expect(p.crit).toBeCloseTo(1 / 6, 9);
    expect(p.norm).toBeCloseTo(2 / 6, 9);
    expect(p.fail).toBeCloseTo(3 / 6, 9);
  });

  it('BS=4+, lethal=5+: 2/6 crit (5,6), 1/6 norm (4)', () => {
    const p = DieProbs.fromSkills(5, 4, Ability.None);
    expect(p.crit).toBeCloseTo(2 / 6, 9);
    expect(p.norm).toBeCloseTo(1 / 6, 9);
    expect(p.fail).toBeCloseTo(3 / 6, 9);
  });

  it('BS=6+, lethal=4+: lethal must NOT promote 4s/5s — only nat 6 crits', () => {
    const p = DieProbs.fromSkills(4, 6, Ability.None);
    expect(p.crit).toBeCloseTo(1 / 6, 9);
    expect(p.norm).toBeCloseTo(0, 9);
    expect(p.fail).toBeCloseTo(5 / 6, 9);
  });

  it('BS=5+, lethal=5+: 2/6 crit, 0 norm', () => {
    const p = DieProbs.fromSkills(5, 5, Ability.None);
    expect(p.crit).toBeCloseTo(2 / 6, 9);
    expect(p.norm).toBeCloseTo(0, 9);
    expect(p.fail).toBeCloseTo(4 / 6, 9);
  });

  it('BS=6+, no lethal: 1/6 crit, 0 norm', () => {
    const p = DieProbs.fromSkills(6, 6, Ability.None);
    expect(p.crit).toBeCloseTo(1 / 6, 9);
    expect(p.norm).toBeCloseTo(0, 9);
    expect(p.fail).toBeCloseTo(5 / 6, 9);
  });
});

describe('DieProbs.fromSkills reroll ones when nothing can fail', () => {
  function expectDistribution(p: DieProbs, crit: number, norm: number, fail: number) {
    expect(p.fail).toBeGreaterThanOrEqual(0);
    expect(p.crit + p.norm + p.fail).toBeCloseTo(1, 12);
    expect(p.crit).toBeCloseTo(crit, 12);
    expect(p.norm).toBeCloseTo(norm, 12);
    expect(p.fail).toBeCloseTo(fail, 12);
  }

  // Face 1 is a normal success. Rerolling it can still crit:
  // crit = 1/6 + (1/6)*(1/6) = 7/36, norm = 4/6 + (1/6)*(5/6) = 29/36.
  it('BS 1+ crit-on-6 RerollOnes stays a probability', () => {
    expectDistribution(DieProbs.fromSkills(6, 1, Ability.RerollOnes), 7 / 36, 29 / 36, 0);
  });

  it('BS 1+ crit-on-6 RerollOnesPlusBalanced stays a probability', () => {
    expectDistribution(
      DieProbs.fromSkills(6, 1, Ability.RerollOnesPlusBalanced),
      7 / 36,
      29 / 36,
      0,
    );
  });

  it('always-normal and always-crit dice stay all successes under Ones', () => {
    expectDistribution(DieProbs.fromSkills(7, 1, Ability.RerollOnes), 0, 1, 0);
    expectDistribution(DieProbs.fromSkills(1, 1, Ability.RerollOnes), 1, 0, 0);
    expectDistribution(DieProbs.fromSkills(7, 1, Ability.RerollOnesPlusBalanced), 0, 1, 0);
    expectDistribution(DieProbs.fromSkills(1, 1, Ability.RerollOnesPlusBalanced), 1, 0, 0);
  });

  // Lethal 5+ on a 1+: faces 5 and 6 crit. The pre-reroll fail is a float residue,
  // not a real failure, and the 7/6 factor still drives fail to -1/6.
  it('lethal 5+ on a 1+ cannot fail under RerollOnes', () => {
    const crit = (2 / 6) * (7 / 6);
    expectDistribution(DieProbs.fromSkills(5, 1, Ability.RerollOnes), crit, 1 - crit, 0);
  });

  it('2+ through 6+ Ones, Ceaseless, Balanced, Relentless and combined rerolls stay normalized', () => {
    const rerolls = [
      Ability.None,
      Ability.RerollOnes,
      Ability.RerollOnesPlusBalanced,
      Ability.Relentless,
      Ability.Balanced,
      Ability.DoubleBalanced,
      Ability.RerollMostCommonFail,
      Ability.RerollMostCommonFailPlusBalanced,
      Ability.CritFishRelentless,
    ];
    for (const stat of [2, 3, 4, 5, 6]) {
      const baseCrit = 1 / 6;
      const baseNorm = Math.max(0, (6 - stat) / 6);
      const baseFail = 1 - baseCrit - baseNorm;
      for (const reroll of rerolls) {
        const p = DieProbs.fromSkills(6, stat, reroll);
        expect(p.fail).toBeGreaterThanOrEqual(0);
        expect(p.crit + p.norm + p.fail).toBeCloseTo(1, 12);
      }
      for (const reroll of [Ability.RerollOnes, Ability.RerollOnesPlusBalanced]) {
        const p = DieProbs.fromSkills(6, stat, reroll);
        expect(p.crit).toBeCloseTo(baseCrit * 7 / 6, 12);
        expect(p.norm).toBeCloseTo(baseNorm * 7 / 6, 12);
        expect(p.fail).toBeCloseTo(1 - (baseCrit + baseNorm) * 7 / 6, 12);
      }
      const rel = DieProbs.fromSkills(6, stat, Ability.Relentless);
      const relMul = 1 + baseFail;
      expect(rel.crit).toBeCloseTo(baseCrit * relMul, 12);
      expect(rel.norm).toBeCloseTo(baseNorm * relMul, 12);
    }
  });
});
