import Model from 'src/Model';
import * as Util from 'src/Util';
import { range } from 'lodash';
import Ability from 'src/Ability';
import ShootOptions from 'src/ShootOptions';
import { calcDmgProbs } from 'src/CalcEngineShoot';
import {
  calcDamage,
  calcPostFnpDamages,
  calcRelicsOutcomes,
  DamageResult,
} from 'src/CalcEngineShootInternal';
import {
  SaintlyRelicsInspiring,
  SaintlyRelicsNormal,
  SaintlyRelicsOff,
} from 'src/SaintlyRelics';
import { requiredPrecision } from 'src/CalcEngineCommon.test';

function newTestAttacker(attacks: number = 1, bs: number = 4) : Model {
  return new Model(attacks, bs, 11, 13);
}

function avgDmg(attacker: Model, defender: Model, numRounds: number = 1): number {
  return Util.weightedAverage(calcDmgProbs(attacker, defender, new ShootOptions(numRounds)));
}

describe(calcDamage.name + ', typical dmgs (norm < crit < 2 * norm)', () => {
  // test typical situation of normDmg < critDmg < 2*normDmg
  const dn = 5; // normal damage
  const dc = 7; // critical damage
  const dmw = 100; // mortal wound damage
  const atker = new Model(0, 0, dn, dc, dmw);
  const def = new Model();

  it('0ch 0nh vs 0cs 0ns => 0', () => {
    expect(calcDamage(atker, def, 0, 0, 0, 0).damage).toBe(0);
  });
  it('0ch 2nh vs 0cs 0ns => 2dn', () => {
    expect(calcDamage(atker, def, 0, 2, 0, 0).damage).toBe(2 * dn);
  });
  it('0ch 2nh vs 0cs 1ns => 1dn', () => {
    expect(calcDamage(atker, def, 0, 2, 0, 1).damage).toBe(dn);
  });
  it('0ch 2nh vs 1cs 1ns => 0', () => {
    expect(calcDamage(atker, def, 0, 2, 1, 1).damage).toBe(0);
  });
  it('0ch 2nh vs 3cs 3ns => 0', () => {
    expect(calcDamage(atker, def, 0, 2, 3, 3).damage).toBe(0);
  });
  it('1ch 0nh vs 0cs 1ns => 1dmw + 1dc', () => {
    expect(calcDamage(atker, def, 1, 0, 0, 1).damage).toBe(dmw + dc);
  });
  it('1ch 0nh vs 0cs 2ns => 1dmw', () => {
    expect(calcDamage(atker, def, 1, 0, 0, 2).damage).toBe(dmw);
  });
  it('1ch 1nh vs 0cs 2ns => 1dmw + 1dn', () => {
    expect(calcDamage(atker, def, 1, 1, 0, 2).damage).toBe(dmw + dn);
  });
  it('2ch 2nh vs 0cs 3ns => 2dmw + 1dc + 1dn', () => {
    expect(calcDamage(atker, def, 2, 2, 0, 3).damage).toBe(2 * dmw + dc + dn);
  });
  it('3ch 2nh vs 1cs 3ns => 3dmw + 1dc + 1dn', () => {
    expect(calcDamage(atker, def, 3, 2, 1, 3).damage).toBe(3 * dmw + dc + dn);
  });
});

describe(calcDamage.name + ', bigCrit (2 * norm < crit)', () => {
  // now test with critHits being so big that normSaves should prefer to first cancel critHits
  const dn = 10; // normal damage
  const dc = 100; // critical damage
  const dmw = 1000; // mortal wound damage
  const atker = new Model(0, 0, dn, dc, dmw);
  const def = new Model();

  it('bigCrit, 0ch 0nh vs 0cs 0ns => 0', () => {
    expect(calcDamage(atker, def, 0, 0, 0, 0).damage).toBe(0);
  });
  it('bigCrit, 0ch 2nh vs 0cs 1ns => 1dn', () => {
    expect(calcDamage(atker, def, 0, 2, 0, 1).damage).toBe(dn);
  });
  it('bigCrit, 0ch 2nh vs 1cs 1ns => 0', () => {
    expect(calcDamage(atker, def, 0, 2, 1, 1).damage).toBe(0);
  });
  it('bigCrit, 0ch 2nh vs 3cs 3ns => 0', () => {
    expect(calcDamage(atker, def, 0, 2, 3, 3).damage).toBe(0);
  });
  it('bigtCrit, 1ch 0nh vs 0cs 1ns => 1dmw + 1dc', () => {
    expect(calcDamage(atker, def, 1, 0, 0, 1).damage).toBe(dmw + dc);
  });
  it('bigtCrit, 1ch 0nh vs 0cs 2ns => 1dmw', () => {
    expect(calcDamage(atker, def, 1, 0, 0, 2).damage).toBe(dmw);
  });
  it('bigtCrit, 1ch 2nh vs 0cs 2ns => 1dmw + 2dn', () => {
    expect(calcDamage(atker, def, 1, 2, 0, 2).damage).toBe(dmw + 2 * dn);
  });
  it('bigtCrit, 2ch 2nh vs 0cs 3ns => 2dmw + 1dc + 1dn', () => {
    expect(calcDamage(atker, def, 2, 2, 0, 3).damage).toBe(2 * dmw + dc + dn);
  });
});

describe(calcDamage.name + ', smallCrit (crit < norm)', () => {
  // now test with critHits being so small that normHits are always the first choice to cancel
  const dn = 100; // normal damage
  const dc = 10; // critical damage
  const dmw = 1000; // mortal wound damage
  const atker = new Model(0, 0, dn, dc, dmw);
  const def = new Model();

  it('smallCrit, 0ch 0nh vs 0cs 0ns => 0', () => {
    expect(calcDamage(atker, def, 0, 0, 0, 0).damage).toBe(0);
  });
  it('smallCrit, 0ch 2nh vs 0cs 1ns => 1dn', () => {
    expect(calcDamage(atker, def, 0, 2, 0, 1).damage).toBe(dn);
  });
  it('smallCrit, 0ch 2nh vs 1cs 1ns => 0', () => {
    expect(calcDamage(atker, def, 0, 2, 1, 1).damage).toBe(0);
  });
  it('smallCrit, 0ch 2nh vs 3cs 3ns => 0', () => {
    expect(calcDamage(atker, def, 0, 2, 3, 3).damage).toBe(0);
  });
  it('smallCrit, 1ch 0nh vs 0cs 1ns => 1dmw + 1dc', () => {
    expect(calcDamage(atker, def, 1, 0, 0, 1).damage).toBe(dmw + dc);
  });
  it('smallCrit, 1ch 0nh vs 0cs 2ns => 1dmw', () => {
    expect(calcDamage(atker, def, 1, 0, 0, 2).damage).toBe(dmw);
  });
  it('smallCrit, 1ch 2nh vs 0cs 2ns => 1dmw + 1dc', () => {
    expect(calcDamage(atker, def, 1, 2, 0, 2).damage).toBe(dmw + dc);
  });
  it('smallCrit, 2ch 2nh vs 0cs 3ns => 2dmw + 2dc', () => {
    expect(calcDamage(atker, def, 2, 2, 0, 3).damage).toBe(2 * dmw + 2 * dc);
  });
});

describe(calcDamage.name + ', numHits with MWx', () => {
  // cancelled crit still counts as a hit when MWx contributed damage
  const dn = 1;
  const dc = 4;
  const dmw = 2;
  const atker = new Model(0, 0, dn, dc, dmw);
  const def = new Model();

  it('1 crit cancelled by 1 crit save, mwx leaks => numHits=1', () => {
    const r = calcDamage(atker, def, 1, 0, 1, 0);
    expect(r.damage).toBe(dmw);
    expect(r.numHits).toBe(1);
  });
  it('2 crits, 1 cancelled, 1 norm survives => numHits=3 (mwx for both crits)', () => {
    const r = calcDamage(atker, def, 2, 1, 1, 0);
    expect(r.damage).toBe(2 * dmw + dc + dn);
    expect(r.numHits).toBe(3);
  });
  it('1 crit cancelled, mwx=0 => numHits=0 (no dmg, no FNP)', () => {
    const noMwxAtker = new Model(0, 0, dn, dc, 0);
    const r = calcDamage(noMwxAtker, def, 1, 0, 1, 0);
    expect(r.damage).toBe(0);
    expect(r.numHits).toBe(0);
  });
});

describe(calcDamage.name + ', JustAScratch cancels the higher-damage hit', () => {
  const def = new Model().setAbility(Ability.JustAScratch);

  it('critDmg=0 < normDmg=3, 1ch 1nh => cancels the norm, 0 dmg', () => {
    const atker = new Model(0, 0, 3, 0, 0);
    const r = calcDamage(atker, def, 1, 1, 0, 0);
    expect(r.damage).toBe(0);
    expect(r.survivingCritHits).toBe(1);
    expect(r.survivingNormHits).toBe(0);
  });
  it('critDmg=2 < normDmg=5, 1ch 1nh => cancels the norm, 1dc', () => {
    const atker = new Model(0, 0, 5, 2, 0);
    expect(calcDamage(atker, def, 1, 1, 0, 0).damage).toBe(2);
  });
  it('critDmg=4 > normDmg=3, 1ch 1nh => cancels the crit, 1dn', () => {
    const atker = new Model(0, 0, 3, 4, 0);
    expect(calcDamage(atker, def, 1, 1, 0, 0).damage).toBe(3);
  });
  it('critDmg == normDmg, 1ch 1nh => cancels the crit on a tie', () => {
    const atker = new Model(0, 0, 3, 3, 0);
    const r = calcDamage(atker, def, 1, 1, 0, 0);
    expect(r.damage).toBe(3);
    expect(r.survivingCritHits).toBe(0);
    expect(r.survivingNormHits).toBe(1);
  });
  it('prefers norms but none hit, 2ch 0nh => falls back to cancelling a crit', () => {
    const atker = new Model(0, 0, 5, 2, 0);
    expect(calcDamage(atker, def, 2, 0, 0, 0).damage).toBe(2);
  });
  it('prefers crits but none hit, 0ch 2nh => falls back to cancelling a norm', () => {
    const atker = new Model(0, 0, 3, 5, 0);
    expect(calcDamage(atker, def, 0, 2, 0, 0).damage).toBe(3);
  });
  it('no hits => 0 dmg', () => {
    const atker = new Model(0, 0, 3, 0, 0);
    expect(calcDamage(atker, def, 0, 0, 0, 0).damage).toBe(0);
  });
  it('MWx is kept either way: critDmg=0 < normDmg=3, mwx=2, 1ch 1nh => only 1dmw', () => {
    const atker = new Model(0, 0, 3, 0, 2);
    expect(calcDamage(atker, def, 1, 1, 0, 0).damage).toBe(2);
  });
  // JaS is applied before saves, so the best die to cancel depends on what the saves can block
  it('critDmg=2 < normDmg=3, 1ch 1nh vs 0cs 1ns => cancels the crit so the save blocks the norm, 0 dmg', () => {
    const atker = new Model(0, 0, 3, 2, 0);
    expect(calcDamage(atker, def, 1, 1, 0, 1).damage).toBe(0);
  });
});

// Brute force: every legal use of the saves (including wasteful ones) and every JaS choice.
// JaS (Normals) then drops one normal that is still there, before any save is spent.
function bruteForceMinDamage(atker: Model, defender: Model, ch: number, nh: number, cs: number, ns: number) {
  const jasChoices: [number, number][] = [[ch, nh]];
  if (defender.has(Ability.JustAScratch)) {
    jasChoices.length = 0;
    if (ch > 0) jasChoices.push([ch - 1, nh]);
    if (nh > 0) jasChoices.push([ch, nh - 1]);
    if (ch + nh === 0) jasChoices.push([0, 0]);
  }
  let best = Infinity;
  for (const [c0, n1] of jasChoices) {
    const n0 = defender.has(Ability.JustAScratchNorms) && n1 > 0 ? n1 - 1 : n1;
    for (let a = 0; a <= Math.min(cs, c0); a++) {
      for (let b = 0; b <= Math.min(cs - a, n0); b++) {
        for (let c = 0; c <= Math.min(ns, n0 - b); c++) {
          for (let d = 0; d <= Math.min(Math.floor((ns - c) / 2), c0 - a); d++) {
            const crits = c0 - a - d;
            const norms = n0 - b - c;
            const dmg = ch * atker.mwx + crits * atker.critDmg + norms * atker.normDmg;
            best = Math.min(best, dmg);
          }
        }
      }
    }
  }
  return best;
}

const bruteForceProfiles: [number, number][] = [[3, 4], [4, 4], [4, 5], [3, 6], [3, 7], [2, 4], [5, 4], [4, 9]];

// calcDamage must match the brute force for every 0-3 hits/saves split.
function expectMatchesBruteForce(defender: Model) {
  for (const [dn, dc] of bruteForceProfiles) {
    for (const mwx of [0, 2]) {
      const atker = new Model(0, 0, dn, dc, mwx);
      for (let ch = 0; ch <= 3; ch++) {
        for (let nh = 0; nh <= 3; nh++) {
          for (let cs = 0; cs <= 3; cs++) {
            for (let ns = 0; ns <= 3; ns++) {
              const expected = bruteForceMinDamage(atker, defender, ch, nh, cs, ns);
              const actual = calcDamage(atker, defender, ch, nh, cs, ns).damage;
              if (actual !== expected) {
                throw new Error(`D=${dn}/${dc} mwx=${mwx} ${ch}ch ${nh}nh vs ${cs}cs ${ns}ns: `
                  + `got ${actual}, brute force ${expected}`);
              }
            }
          }
        }
      }
    }
  }
}

describe(calcDamage.name + ', save allocation', () => {
  const def = new Model();

  for (const withJas of [false, true]) {
    it(`matches brute force for every 0-3 hits/saves split${withJas ? ', with JaS' : ''}`, () => {
      expectMatchesBruteForce(withJas ? new Model().setAbility(Ability.JustAScratch) : def);
    });
  }
});

describe(calcPostFnpDamages.name, () => {
  it('5 damage from 1 hit, fnp 5+: can only reduce to 4', () => {
    const fnp = 5;
    const ps = 2 / 6; // probability of FNP success (roll >= 5)
    const pf = 4 / 6; // probability of FNP failure
    // key = "damage,numHits"
    const preFnpDmgs = new Map<string,number>([ ['5,1', 1] ]);
    const postFnpDmgs = calcPostFnpDamages(fnp, preFnpDmgs);

    // 1 hit => 1 FNP roll => either pass (dmg=4) or fail (dmg=5)
    expect(postFnpDmgs.get(4)).toBeCloseTo(ps, requiredPrecision);
    expect(postFnpDmgs.get(5)).toBeCloseTo(pf, requiredPrecision);
    expect(postFnpDmgs.size).toBe(2);
  });
  it('6 damage from 2 hits, fnp 5+: can reduce by up to 2', () => {
    const fnp = 5;
    const ps = 2 / 6; // probability of FNP success
    const pf = 4 / 6; // probability of FNP failure
    const preFnpDmgs = new Map<string,number>([ ['6,2', 1] ]);
    const postFnpDmgs = calcPostFnpDamages(fnp, preFnpDmgs);

    // 2 hits => 2 FNP rolls => binomial(2, ps)
    // 0 successes => dmg=6, 1 success => dmg=5, 2 successes => dmg=4
    expect(postFnpDmgs.get(4)).toBeCloseTo(ps * ps, requiredPrecision);
    expect(postFnpDmgs.get(5)).toBeCloseTo(2 * ps * pf, requiredPrecision);
    expect(postFnpDmgs.get(6)).toBeCloseTo(pf * pf, requiredPrecision);
    expect(postFnpDmgs.size).toBe(3);
  });
  it('2 damage from 2 hits, fnp 5+: minimum damage is 1 (skipZeroDamage)', () => {
    const fnp = 5;
    const ps = 2 / 6;
    const pf = 4 / 6;
    const preFnpDmgs = new Map<string,number>([ ['2,2', 1] ]);
    const postFnpDmgs = calcPostFnpDamages(fnp, preFnpDmgs);

    // 2 hits, 2 damage => 0 successes(dmg=2), 1 success(dmg=1), 2 successes(dmg=0, dropped)
    expect(postFnpDmgs.get(1)).toBeCloseTo(2 * ps * pf, requiredPrecision);
    expect(postFnpDmgs.get(2)).toBeCloseTo(pf * pf, requiredPrecision);
    expect(postFnpDmgs.size).toBe(2);
  });
  it('mixed scenarios with different hit counts', () => {
    const fnp = 5;
    const ps = 2 / 6;
    const pf = 4 / 6;
    const p1 = 0.4; // prob of 3 damage from 1 hit
    const p2 = 0.6; // prob of 5 damage from 2 hits
    const preFnpDmgs = new Map<string,number>([
      ['3,1', p1],
      ['5,2', p2],
    ]);
    const postFnpDmgs = calcPostFnpDamages(fnp, preFnpDmgs);

    // scenario 1: 3 dmg, 1 hit => pass(dmg=2) or fail(dmg=3)
    // scenario 2: 5 dmg, 2 hits => 0 pass(dmg=5), 1 pass(dmg=4), 2 pass(dmg=3)
    expect(postFnpDmgs.get(2)).toBeCloseTo(p1 * ps, requiredPrecision);
    expect(postFnpDmgs.get(3)).toBeCloseTo(p1 * pf + p2 * ps * ps, requiredPrecision);
    expect(postFnpDmgs.get(4)).toBeCloseTo(p2 * 2 * ps * pf, requiredPrecision);
    expect(postFnpDmgs.get(5)).toBeCloseTo(p2 * pf * pf, requiredPrecision);
    expect(postFnpDmgs.size).toBe(4);
  });
});

describe(calcDmgProbs.name + ', few dice, no abilities', () => {
  const bs = 4;
  const pc = 1/6; // crit probability
  const pn = 1/3; // norm probability
  const pf = 1/2; // fail probability
  const dc = 13;
  const dn = 11;
  const atk1 = new Model(1, bs, dn, dc);
  const atk2 = new Model(2, bs, dn, dc);
  const def0 = new Model(0, bs);
  const def1 = new Model(1, bs);

  it('test coherency', () => {
    expect(pc + pn + pf).toBeCloseTo(1, requiredPrecision);
  });
  it('1 atkDie vs 0 defDie', () => {
    const damageToProb = calcDmgProbs(atk1, def0);
    expect(damageToProb.size).toBe(3);
    expect(damageToProb.get(0)).toBe(pf);
    expect(damageToProb.get(dn)).toBe(pn);
    expect(damageToProb.get(dc)).toBe(pc);
  });
  it('2 atkDie vs 0 defDie', () => {
    const damageToProb = calcDmgProbs(atk2, def0);
    expect(damageToProb.size).toBe(6);
    expect(damageToProb.get(0)).toBeCloseTo(pf * pf, requiredPrecision);
    expect(damageToProb.get(dn)).toBeCloseTo(pn * pf * 2, requiredPrecision);
    expect(damageToProb.get(2 * dn)).toBeCloseTo(pn * pn, requiredPrecision);
    expect(damageToProb.get(dc)).toBeCloseTo(pc * pf * 2, requiredPrecision);
    expect(damageToProb.get(dc + dn)).toBeCloseTo(pc * pn * 2, requiredPrecision);
    expect(damageToProb.get(2 * dc)).toBeCloseTo(pc * pc, requiredPrecision);
  });
  it('1 atkDie vs 1 defDie', () => {
    const damageToProb = calcDmgProbs(atk1, def1);
    const probCritDelivered = pc * (1 - pc); // atk crit and def non-crit
    const probNormDelivered = pn * pf; // atk crit and def non-crit
    const probNothingDeliveredCalculatedDirectly = pf + pc * pc + pn * (1 - pf);
    const probNothingDeliveredCalculatedAsRemainder = 1 - probCritDelivered - probNormDelivered;

    // make sure test didn't mess up this calc
    expect(probNothingDeliveredCalculatedDirectly)
      .toBeCloseTo(probNothingDeliveredCalculatedAsRemainder, requiredPrecision);

    expect(damageToProb.size).toBe(3);
    expect(damageToProb.get(dc)).toBeCloseTo(pc * (1 - pc), requiredPrecision);
    expect(damageToProb.get(dn)).toBeCloseTo(pn * pf, requiredPrecision); // atk norm vs def fail
    expect(damageToProb.get(0)).toBeCloseTo(probNothingDeliveredCalculatedDirectly, requiredPrecision); // atk fail or atk cancelled
  });
  it('2 atkDie vs 1 defDie', () => {
    const damageToProb = calcDmgProbs(atk2, def1);

    const probNothingDelivered
      = pc * pf * 2 * pc // 1c vs 1c
      + pn * pf * 2 * (1 - pf) // 1n vs 1 not-fail
      + pf * pf // nothing vs anything
      ;
    const prob1NormDelivered
      = pc * pn * 2 * pc // 1c+1n vs 1c
      + pn * pn * (1 - pf) // 2n vs 1 not-fail
      + pn * pf * 2 * pf // 1n vs 1f
      ;
    const prob1CritDelivered
      = pc * pc * pc // 2c vs 1c
      + pc * pn * 2 * pn // 1c+1n vs 1n
      + pc * pf * 2 * (1 - pc) // 1c vs 1 not-crit
      ;
    const prob1Crit1NormDelivered = pc * pn * 2 * pf;
    const prob2NormDelivered = pn * pn * pf;
    const prob2CritDelivered = pc * pc * (1 - pc);

    // make sure test didn't mess up this calc
    expect(
      probNothingDelivered
      + prob1NormDelivered
      + prob1CritDelivered
      + prob1Crit1NormDelivered
      + prob2NormDelivered
      + prob2CritDelivered
      ).toBeCloseTo(1, requiredPrecision);

    expect(damageToProb.size).toBe(6);
    expect(damageToProb.get(0)).toBeCloseTo(probNothingDelivered, requiredPrecision);
    expect(damageToProb.get(dn)).toBeCloseTo(prob1NormDelivered, requiredPrecision);
    expect(damageToProb.get(dc)).toBeCloseTo(prob1CritDelivered, requiredPrecision);
    expect(damageToProb.get(dc + dn)).toBeCloseTo(prob1Crit1NormDelivered, requiredPrecision);
    expect(damageToProb.get(2 * dn)).toBeCloseTo(prob2NormDelivered, requiredPrecision);
    expect(damageToProb.get(2 * dc)).toBeCloseTo(prob2CritDelivered, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', MWx', () => {
  // we tested mwx for calcDamage; quick test to make sure calcDamageProbabilities respects mwx too
  it('basic', () => {
    const dmw = 1000; // mw damage
    const pc = 1 / 6;
    const pn = 5 / 6;
    const atk = newTestAttacker(1, 1).setProp('mwx', dmw);
    const def = new Model(1, 1); // 1 defense die, always saves on 1+

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(pn, requiredPrecision); // norm hit, any save
    expect(dmgs.get(dmw)).toBeCloseTo(pc * pc, requiredPrecision); // crit hit, crit save
    expect(dmgs.get(dmw + atk.critDmg)).toBeCloseTo(pn * pc, requiredPrecision); // crit hit, norm save
    expect(dmgs.size).toBe(3);
  });
});

describe(calcDmgProbs.name + ', APx', () => {
  it('APx vs fewer defense dice', () => {
    const atkApx0 = new Model().setProp('apx', 0);
    const atkApx1 = new Model().setProp('apx', 1);
    const atkApx2 = new Model().setProp('apx', 2);
    const def0 = new Model().setProp('numDice', 0);
    const def1 = new Model().setProp('numDice', 1);
    const def2 = new Model().setProp('numDice', 2);
    const def3 = new Model().setProp('numDice', 3);

    // scenarios with 0 defense dice (0-0, 1-1,);
    const dmgs0Minus0DefDice = calcDmgProbs(atkApx0, def0);
    const dmgs1Minus1DefDice = calcDmgProbs(atkApx1, def1);
    expect(dmgs0Minus0DefDice).toStrictEqual(dmgs1Minus1DefDice);

    // scenarios with 1 defense dice (1-0, 2-1, 3-2,);
    const dmgs1Minus0DefDice = calcDmgProbs(atkApx0, def1);
    const dmgs2Minus1DefDice = calcDmgProbs(atkApx1, def2);
    const dmgs3Minus2DefDice = calcDmgProbs(atkApx2, def3);
    expect(dmgs1Minus0DefDice).toStrictEqual(dmgs2Minus1DefDice);
    expect(dmgs1Minus0DefDice).toStrictEqual(dmgs3Minus2DefDice);

    // scenarios with 2 defense dice (2-0, 3-1,);
    const dmgs2Minus0DefDice = calcDmgProbs(atkApx0, def2);
    const dmgs3Minus1DefDice = calcDmgProbs(atkApx1, def3);
    expect(dmgs2Minus0DefDice).toStrictEqual(dmgs3Minus1DefDice);

    expect(Util.weightedAverage(dmgs2Minus0DefDice))
      .toBeLessThan(Util.weightedAverage(dmgs2Minus1DefDice));
    expect(Util.weightedAverage(dmgs1Minus0DefDice))
      .toBeLessThan(Util.weightedAverage(dmgs0Minus0DefDice));

    // apx > def should give same results as apx = def
    const dmgs1Minus2DefDice = calcDmgProbs(atkApx2, def1);
    expect(dmgs1Minus1DefDice).toStrictEqual(dmgs1Minus2DefDice);
  });
});

describe(calcDmgProbs.name + ', px and lethal', () => {
  it('px gets rid of def dice on crit', () => {
    const atk = newTestAttacker(1, 1).setProp('px', 4).setProp('lethal', 5);
    const pc = (7 - atk.critSkill()) / 6;
    const def = new Model(4, 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1 - pc, requiredPrecision);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(pc, requiredPrecision);
  });

  it('0 < apx < px, apx used when no crit', () => {
    const atk = newTestAttacker(1, 1).setProp('apx', 1).setProp('px', 2).setProp('lethal', 5);
    const def = new Model(2, 1);
    const [pc, pn, ] = atk.toAttackerDieProbs().toCritNormFail();

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(pn, requiredPrecision);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(pc, requiredPrecision);
    expect(dmgs.size).toBe(2);
  });

  it('px branch carries failsToNorms and abilities to defender save calc', () => {
    // Regression for a bug where the Px-branch call to calcFinalDiceProbs
    // routed defender.normsToCrits into the failsToNorms slot and dropped
    // defender.abilities entirely. Setup: attacker always crits; defender's
    // failsToNorms is large enough that, on a 2-die Px save, every fail is
    // promoted to a norm and the cumulative defender result always cancels
    // the single incoming crit. If the Px branch silently dropped
    // failsToNorms, kill chance would be non-zero from (0,0,2)/(0,1,1) rolls.
    const atk = newTestAttacker(1, 1)
      .setProp('lethal', 1) // always crit
      .setProp('px', 1);
    const def = Model.basicDefender(3, 12).setProp('failsToNorms', 2);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });

  it('defender ObscuredTarget does not bleed onto defender save dice', () => {
    // Regression: ObscuredTarget is a defender-side flag that modifies the
    // *attacker's* dice (already merged into attacker.abilities by
    // calcFinalDiceProbsForAttacker). It must not also apply to the defender's
    // own save dice, where applyPostRollModifications would otherwise discard
    // save successes via the "norms = norms + crits - 1; crits = 0" line.
    //
    // (Note: ObscuredTarget zeroes attacker crits, so this case routes through
    // the non-Px branch even with px set. The filter is applied to both
    // defender branches in calcDefenderFinalDiceStuff, so a single non-Px
    // assertion covers both code paths against this regression.)
    //
    // Setup probes the defender side: 2 always-crit attack dice + Obscured
    // discards down to 1 norm hit reaching the defender. The defender has
    // autoNorms=1, which guarantees a normal save that cancels the leftover
    // norm hit -- *unless* ObscuredTarget also runs against the defender's
    // own dice, in which case the discard-one rule consumes the autoNorm and
    // some defender outcomes leak the norm hit through.
    const atk = newTestAttacker(2, 1).setProp('lethal', 1).setProp('px', 1);
    const def = Model.basicDefender(3, 12).setProp('autoNorms', 1);
    def.abilities.add(Ability.ObscuredTarget);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
});

describe(calcDmgProbs.name + ', balanced', () => {
  it('balanced with 1 atk die', () => {
    const atk = newTestAttacker(1).setProp('reroll', Ability.Balanced);
    const [pc, pn, pf] = atk.toAttackerDieProbs().toCritNormFail();
    const def = new Model(0);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(pf * pf, requiredPrecision);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(pn + pf * pn, requiredPrecision);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(pc + pf * pc, requiredPrecision);
    expect(dmgs.size).toBe(3);
  });
});

describe(calcDmgProbs.name + ', RerollOnes', () => {
  it('RerollOnes with 1 atk die', () => {
    const atk = newTestAttacker(1).setProp('reroll', Ability.RerollOnes);
    const pc = 1 / 6;
    const pn = 2 / 6;
    const pf = 3 / 6;
    const p1 = 1 / 6; // probability of rolling exactly a 1
    const def = new Model(0);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo((pf - p1) + p1 * pf, requiredPrecision);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(pn + p1 * pn, requiredPrecision);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(pc + p1 * pc, requiredPrecision);
    expect(dmgs.size).toBe(3);
  });
  it('RerollOnes damage', () => {
    const atk = newTestAttacker(3);
    const atkRerollOnes = atk.withProp('reroll', Ability.RerollOnes);
    const def = new Model(0);

    const dmg = avgDmg(atk, def);
    const dmgRerollOnes = avgDmg(atkRerollOnes, def);
    expect(dmgRerollOnes).toBeCloseTo(dmg * 7 / 6, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', relentless', () => {
  it('relentless with 1 atk die', () => {
    const atk = newTestAttacker(1).setProp('reroll', Ability.Relentless);
    const pc = 1 / 6;
    const pn = 2 / 6;
    const pf = 3 / 6;
    const def = new Model(0);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(pf * pf, requiredPrecision);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(pn + pf * pn, requiredPrecision);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(pc + pf * pc, requiredPrecision);
    expect(dmgs.size).toBe(3);
  });
  it('relentless damage', () => {
    const atk = newTestAttacker(3, 4);
    const atkRelentless = atk.withProp('reroll', Ability.Relentless);
    const def = new Model(0);

    const dmg = avgDmg(atk, def);
    const dmgRelentless = avgDmg(atkRelentless, def);
    expect(dmgRelentless).toBeCloseTo(dmg * 1.5, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', mystic scry and punishing vs saves', () => {
  it('mystic scry keeps the crit when one cover save and Piercing Crits 1 beat two normals', () => {
    // 2 dice at 2+, never crit: 25/36 two norms, 10/36 one norm + one fail, 1/36 two fails.
    // Two normals upgrade one to a crit (Piercing removes the cover) for 7.
    // One norm and one fail: fail->norm is 6 raw but the cover leaves 3; norm->crit is 4 and
    // Piercing Crits 1 removes the cover die, so 4 gets through. Two fails become one saved norm.
    const atk = new Model(2, 2, 3, 4).setProp('lethal', 7).setProp('px', 1)
      .setAbility(Ability.MysticScryBuff, true);
    const def = new Model(1, 6).setProp('autoNorms', 1);

    expect(avgDmg(atk, def)).toBeCloseTo((25 * 7 + 10 * 4) / 36, requiredPrecision);
  });

  it('punishing declines the locked norm when one normal save makes the crit line better', () => {
    // 2 dice at 6+: 1/36 two crits, 10/36 one crit + one fail, 25/36 two fails.
    // Norm 6 / crit 2, Rending, FailsToNorms 1, one always-normal save.
    // Taking on the mixed roll locks {1c,1n}: the save blocks the norm and 2 gets through.
    // Declining lets FailsToNorms + Rending make {2c}: one normal save cannot block a crit, so 4.
    const atk = new Model(2, 6, 6, 2).setProp('failsToNorms', 1)
      .setAbility(Ability.Punishing, true)
      .setAbility(Ability.Rending, true);
    const def = new Model(1).withAlwaysNorm();

    expect(avgDmg(atk, def)).toBeCloseTo((1 * 4 + 10 * 4) / 36, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', severe and rending are optional', () => {
  it('severe declines a worse crit: one die at 2+, norm 5 crit 3, no saves', () => {
    // Crit on 6 (1/6), norm on 2-5 (4/6). Forcing every success into a crit would be 2.5.
    const atk = new Model(1, 2, 5, 3).setAbility(Ability.Severe, true);
    const def = new Model(0);

    expect(avgDmg(atk, def)).toBeCloseTo((1 * 3 + 4 * 5) / 6, requiredPrecision);
  });

  it('two normals under severe stay two normals when the crit is worth less', () => {
    const atk = new Model(2, 1, 5, 3).setProp('lethal', 7).setAbility(Ability.Severe, true);
    const def = new Model(0);

    expect(avgDmg(atk, def)).toBeCloseTo(10, requiredPrecision);
  });

  it('severe takes the crit when Devastating makes it better', () => {
    // crit 3 + Devastating 3 = 6, which beats a normal 5, so every success converts.
    const atk = new Model(1, 2, 5, 3, 3).setAbility(Ability.Severe, true);
    const def = new Model(0);

    expect(avgDmg(atk, def)).toBeCloseTo(5, requiredPrecision);
  });

  it('severe takes the crit when one cover save and Piercing Crits 1 invert the raw score', () => {
    // Never crits; a 2+ is a normal (5/6). Raw 5 beats 3, but the cover blocks the normal
    // and the crit removes that cover die.
    const atk = new Model(1, 2, 5, 3).setProp('lethal', 7).setProp('px', 1)
      .setAbility(Ability.Severe, true);
    const def = new Model(1, 6).setProp('autoNorms', 1);

    expect(avgDmg(atk, def)).toBeCloseTo((5 / 6) * 3, requiredPrecision);
  });

  it('one crit and one normal under rending stay put when the crit is worth less', () => {
    // 1 auto-crit + 1 always-normal. Taking Rending would be 6; declining is 8.
    const atk = new Model(2, 1, 5, 3).setProp('lethal', 7).setProp('autoCrits', 1)
      .setAbility(Ability.Rending, true);
    const def = new Model(0);

    expect(avgDmg(atk, def)).toBeCloseTo(8, requiredPrecision);
  });

  it('rending takes the second crit when one normal save inverts the raw score', () => {
    // Raw decline is 8 and two crits are 6. The save blocks the normal (3) and cannot block a crit (6).
    const atk = new Model(2, 1, 5, 3).setProp('lethal', 7).setProp('autoCrits', 1)
      .setAbility(Ability.Rending, true);
    const def = new Model(1).withAlwaysNorm();

    expect(avgDmg(atk, def)).toBeCloseTo(6, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', rending & starfire', () => {
  it('rending, 2 atk dice, probability 2 crits', () => {
    const atk = newTestAttacker(2).setAbility(Ability.Rending, true);
    const [pc, pn, ] = atk.toAttackerDieProbs().toCritNormFail();
    const def = new Model(0);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(2 * atk.critDmg)).toBeCloseTo(pc * pc + 2 * pc * pn, requiredPrecision);
  });
  it('starfire, 2 atk dice, probability 1 crit + 1 norm', () => {
    const atk = newTestAttacker(2).setAbility(Ability.Punishing, true);
    const [pc, pn, pf] = atk.toAttackerDieProbs().toCritNormFail();
    const def = new Model(0);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.critDmg + atk.normDmg))
      .toBeCloseTo(2 * pc * pf + 2 * pc * pn, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', defender fnp', () => {
  it('fnp rolls once per hit, not per damage point', () => {
    // 1 attack die, BS 3+ => crit on 6 (1/6), norm on 3-5 (1/2), fail on 1-2 (1/3)
    // normDmg=1, critDmg=2, no defender saves
    const fnp = 5;
    const ps = 2 / 6; // FNP success probability
    const pf = 4 / 6; // FNP failure probability
    const pCrit = 1 / 6;
    const pNorm = 1 / 2;
    const atk = new Model(1, 3, 1, 2);
    const def = new Model(0).setProp('fnp', fnp);

    const dmgs = calcDmgProbs(atk, def);
    // crit (dmg=2, 1 hit): fnp pass => dmg=1, fnp fail => dmg=2
    // norm (dmg=1, 1 hit): fnp pass => dmg=0 (dropped), fnp fail => dmg=1
    expect(dmgs.get(1)).toBeCloseTo(pCrit * ps + pNorm * pf, requiredPrecision);
    expect(dmgs.get(2)).toBeCloseTo(pCrit * pf, requiredPrecision);
    expect(dmgs.size).toBe(3); // includes dmg=0
  });
});

describe(calcRelicsOutcomes.name, () => {
  // attacker: normDmg 11, critDmg 13
  const atk = new Model(0, 0, 11, 13);

  function result(damage: number, numHits: number, crits: number, norms: number): DamageResult {
    return { damage, numHits, survivingCritHits: crits, survivingNormHits: norms };
  }

  it('off => single unchanged outcome', () => {
    const outcomes = calcRelicsOutcomes(result(13, 1, 1, 0), atk, SaintlyRelicsOff);
    expect(outcomes).toEqual([{ damage: 13, numHits: 1, prob: 1, ignored: false }]);
  });
  it('1 surviving crit, normal (1 D6) => ignore biggest hit on a 6', () => {
    const pIgnore = 1 / 6;
    const outcomes = calcRelicsOutcomes(result(13, 1, 1, 0), atk, SaintlyRelicsNormal);
    // ignored crit => 0 dmg; else full 13
    expect(outcomes.find(o => o.damage === 0)?.prob).toBeCloseTo(pIgnore, requiredPrecision);
    expect(outcomes.find(o => o.damage === 13)?.prob).toBeCloseTo(1 - pIgnore, requiredPrecision);
    expect(outcomes.length).toBe(2);
  });
  it('1 surviving crit, inspiring (2 D6) => ignore prob is 11/36', () => {
    const pIgnore = 11 / 36;
    const outcomes = calcRelicsOutcomes(result(13, 1, 1, 0), atk, SaintlyRelicsInspiring);
    expect(outcomes.find(o => o.damage === 0)?.prob).toBeCloseTo(pIgnore, requiredPrecision);
    expect(outcomes.find(o => o.damage === 13)?.prob).toBeCloseTo(1 - pIgnore, requiredPrecision);
  });
  it('1 crit + 1 norm, normal => prefers the crit, falls back to the norm', () => {
    const q = 5 / 6; // single-attempt miss
    const outcomes = calcRelicsOutcomes(result(24, 2, 1, 1), atk, SaintlyRelicsNormal);
    // ignore the crit (13): 1 - q ; numHits drops to 1
    expect(outcomes.find(o => o.damage === 24 - 13)?.prob).toBeCloseTo(1 - q, requiredPrecision);
    // crit roll missed, ignore the norm (11): q*(1-q)
    expect(outcomes.find(o => o.damage === 24 - 11)?.prob).toBeCloseTo(q * (1 - q), requiredPrecision);
    // nothing ignored: q^2
    expect(outcomes.find(o => o.damage === 24)?.prob).toBeCloseTo(q * q, requiredPrecision);
    expect(outcomes.every(o => o.damage === 24 ? o.numHits === 2 : o.numHits === 1)).toBe(true);
  });
  it('probabilities sum to 1', () => {
    const outcomes = calcRelicsOutcomes(result(24, 2, 1, 1), atk, SaintlyRelicsInspiring);
    const total = outcomes.reduce((sum, o) => sum + o.prob, 0);
    expect(total).toBeCloseTo(1, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', defender saintly relics', () => {
  it('normal relics can ignore the lone hit on a 6', () => {
    // 1 attack die, BS 3+ => crit on 6 (1/6, dmg 2), norm on 3-5 (1/2, dmg 1), fail on 1-2 (1/3)
    const pCrit = 1 / 6;
    const pNorm = 1 / 2;
    const pKeep = 5 / 6; // relic fails to ignore (no 6 on 1 D6)
    const atk = new Model(1, 3, 1, 2);
    const def = new Model(0).setProp('saintlyRelics', SaintlyRelicsNormal);

    const dmgs = calcDmgProbs(atk, def);
    // crit kept => dmg 2; norm kept => dmg 1; anything ignored or a fail => dmg 0
    expect(dmgs.get(2)).toBeCloseTo(pCrit * pKeep, requiredPrecision);
    expect(dmgs.get(1)).toBeCloseTo(pNorm * pKeep, requiredPrecision);
    expect(dmgs.size).toBe(3); // includes dmg 0
  });
  it('inspiring relics ignore more often than normal', () => {
    const atk = new Model(4, 3, 3, 4);
    const off = new Model(0);
    const normal = new Model(0).setProp('saintlyRelics', SaintlyRelicsNormal);
    const inspiring = new Model(0).setProp('saintlyRelics', SaintlyRelicsInspiring);

    const avg = (def: Model) => Util.weightedAverage(calcDmgProbs(atk, def));
    expect(avg(normal)).toBeLessThan(avg(off));
    expect(avg(inspiring)).toBeLessThan(avg(normal));
  });
  it('inspiring relics ignore the lone hit with probability 11/36', () => {
    // 1 attack die, BS 3+ => crit on 6 (1/6, dmg 2), norm on 3-5 (1/2, dmg 1); pins the 11/36 magnitude end-to-end
    const pKeep = 25 / 36; // 1 - 11/36 (relic fails to ignore)
    const atk = new Model(1, 3, 1, 2);
    const def = new Model(0).setProp('saintlyRelics', SaintlyRelicsInspiring);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(2)).toBeCloseTo(1 / 6 * pKeep, requiredPrecision); // crit kept
    expect(dmgs.get(1)).toBeCloseTo(1 / 2 * pKeep, requiredPrecision); // norm kept
    expect(dmgs.size).toBe(3); // includes dmg 0
  });
  it('relics keeps the FNP roll for a crit\'s un-ignorable MWx residual', () => {
    // always-crit attacker: critDmg 1 + mwx 2 => each crit deals 3 (2 mortal, 1 crit dmg)
    // ignoring the crit removes only the 1 crit dmg; the 2 mortal remains and must still be FNP-eligible
    const ps = 1 / 2; // FNP 4+ success
    const pIgnore = 1 / 6; // normal relic
    const atk = new Model(1, 3, 1, 1, 2).withAlwaysCrit();
    const def = new Model(0).setProp('fnp', 4).setProp('saintlyRelics', SaintlyRelicsNormal);

    const dmgs = calcDmgProbs(atk, def);
    // ignore (1/6): dmg 3-1=2, residual MWx still FNP'd => pass->1, fail->2
    // keep   (5/6): dmg 3 => pass->2, fail->3
    expect(dmgs.get(1)).toBeCloseTo(pIgnore * ps, requiredPrecision); // 1/12 — zero if the FNP roll were wrongly dropped
    expect(dmgs.get(2)).toBeCloseTo(pIgnore * (1 - ps) + (1 - pIgnore) * ps, requiredPrecision); // 1/2
    expect(dmgs.get(3)).toBeCloseTo((1 - pIgnore) * (1 - ps), requiredPrecision); // 5/12
    expect(dmgs.size).toBe(3);
  });
  it('enforces the two-dice-per-battle cap across rounds', () => {
    // always-crit attacker, critDmg 2, no MWx; defender 0 dice, normal relics, 3 rounds.
    // each round ignores (damage 0) on a 6 until 2 ignores are spent => damage = 2*(3 - min(#sixes,2)).
    const q = 5 / 6; // a round fails to ignore
    const atk = new Model(1, 3, 2, 2).withAlwaysCrit();
    const def = new Model(0).setProp('saintlyRelics', SaintlyRelicsNormal);

    const dmgs = calcDmgProbs(atk, def, new ShootOptions(3));
    expect(dmgs.get(6)).toBeCloseTo(q * q * q, requiredPrecision); // 0 ignores => 125/216
    expect(dmgs.get(4)).toBeCloseTo(3 * (1 - q) * q * q, requiredPrecision); // 1 ignore => 75/216
    expect(dmgs.get(2)).toBeCloseTo(1 - q * q * q - 3 * (1 - q) * q * q, requiredPrecision); // 2 ignores => 16/216
    expect(dmgs.get(0)).toBeUndefined(); // 3 ignores would be needed for 0 dmg — the battle cap forbids it
    expect(dmgs.size).toBe(3);
  });
});

describe(calcDmgProbs.name + ', defender cover saves', () => {
  it('cover, 1 always-norm-hit vs 1 cover norm save (always cancel)', () => {
    const atk = newTestAttacker(1).withAlwaysNorm();
    const def = new Model(1, 6).setProp('autoNorms', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('cover, 1 always-crit-hit vs 1 cover norm save (never cancel)', () => {
    const atk = newTestAttacker(1).withAlwaysCrit();
    const def = new Model(1, 6).setProp('autoNorms', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('cover, 1 always-crit-hit vs 2 cover norm save (cancel)', () => {
    const atk = newTestAttacker(1).withAlwaysCrit();
    const def = new Model(2, 6).setProp('autoNorms', 2);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('cover, 3 always-norm-hit vs 2 cover norm save (cancel 2 norm hits)', () => {
    const atk = newTestAttacker(3).withAlwaysNorm();
    const def = new Model(2, 6).setProp('autoNorms', 2);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('cover, 2 always-norm-hit vs 1 cover norm save and 1 def roll (sometimes cancelled)', () => {
    const atk = newTestAttacker(2).withAlwaysNorm();
    const def = new Model(2, 3).setProp('autoNorms', 1);
    const [pc, pn, pf] = def.toDefenderDieProbs().toCritNormFail();

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(pc + pn, requiredPrecision);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(pf, requiredPrecision);
    expect(dmgs.size).toBe(2);
  });
  it('cover, 1 always-norm-hit vs 1 cover crit save (always cancel)', () => {
    const atk = newTestAttacker(1).withAlwaysNorm();
    const def = new Model(1, 6).setProp('autoCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('cover, 1 always-crit-hit vs 1 cover crit save (always cancel)', () => {
    const atk = newTestAttacker(1).withAlwaysCrit();
    const def = new Model(1, 6).setProp('autoCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('cover, 2 always-norm-hit vs 1 cover crit save (always cancel 1 norm hit)', () => {
    const atk = newTestAttacker(2).withAlwaysNorm();
    const def = new Model(1, 6).setProp('autoCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('enough apx means not even a cover success', () => {
    const atk = newTestAttacker(1).withAlwaysNorm().setProp('apx', 3);
    const def = new Model(3);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  // A dice can only be retained once. A cover save is retained (as a normal success) without ever
  // being rolled, so a rule that lets you "retain a normal success as a critical success instead"
  // has nothing left to do with it - only saves that came off the dice can be promoted.
  it('save promotions, 1 always-crit-hit vs 1 cover norm save + 1 promotion (cover save cannot be promoted)', () => {
    const atk = newTestAttacker(1).withAlwaysCrit();
    const def = new Model(1, 6).setProp('autoNorms', 1).setProp('normsToCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('save promotions, 2 always-crit-hit vs 1 cover norm save + 1 promotion (cover save cannot be promoted)', () => {
    const atk = newTestAttacker(2).withAlwaysCrit();
    const def = new Model(1, 6).setProp('autoNorms', 1).setProp('normsToCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(2 * atk.critDmg)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('save promotions, 1 always-crit-hit vs 1 rolled always-norm save + 1 promotion (rolled save promotes, cancels)', () => {
    const atk = newTestAttacker(1).withAlwaysCrit();
    const def = new Model(1, 6).withAlwaysNorm().setProp('normsToCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
  it('save promotions, 1 always-crit-hit vs 1 cover + 1 rolled always-norm save + 1 promotion (promotes the rolled one)', () => {
    const atk = newTestAttacker(1).withAlwaysCrit();
    const def = new Model(2, 6).withAlwaysNorm().setProp('autoNorms', 1).setProp('normsToCrits', 1);

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(0)).toBeCloseTo(1, requiredPrecision);
    expect(dmgs.size).toBe(1);
  });
});

// Accurate is "retain UP TO x dice as normal successes", so retaining fewer is a legal - and
// sometimes better - play: a retained norm is locked and cannot be promoted, while rolling that
// dice can produce a crit or a promotable norm.
describe(calcDmgProbs.name + ', Accurate is optional', () => {
  const noSaves = new Model(0); // 0 defence dice, so damage is the attacker's dice value

  it('declines Accurate when the dice is worth more rolled (a promotion is going spare)', () => {
    // 1 die at 2+, never-crit, one norm->crit promotion available.
    // retain: locked norm = 3 dmg. roll: 5/6 chance of a promotable norm -> crit = 5/6 * 4 = 3.333
    const atk = new Model(1, 2, 3, 4).setProp('lethal', 7)
      .setProp('normsToCrits', 1).setProp('autoNorms', 1);

    expect(avgDmg(atk, noSaves)).toBeCloseTo(5 / 6 * 4, requiredPrecision);
  });

  it('declines Accurate when the crit chance alone beats a guaranteed norm', () => {
    // 1 die at 2+ critting on 2+: rolling is 5/6 * 4 = 3.333 vs a retained norm's 3
    const atk = new Model(1, 2, 3, 4).setProp('lethal', 2).setProp('autoNorms', 1);

    expect(avgDmg(atk, noSaves)).toBeCloseTo(5 / 6 * 4, requiredPrecision);
  });

  it('keeps Accurate when the guaranteed norm is worth more than the roll', () => {
    // 1 die at 5+, no promotions: rolling is worth 1/6*4 + 1/6*3 = 1.167 vs a retained norm's 3
    const atk = new Model(1, 5, 3, 4).setProp('autoNorms', 1);

    expect(avgDmg(atk, noSaves)).toBeCloseTo(3, requiredPrecision);
  });

  it('keeps Accurate on ties, so the dice count is the intuitive one', () => {
    // 1 die at 2+, never-crit, no promotions: rolling is 5/6*3 = 2.5 < 3
    const atk = new Model(1, 2, 3, 4).setProp('lethal', 7).setProp('autoNorms', 1);

    expect(avgDmg(atk, noSaves)).toBeCloseTo(3, requiredPrecision);
  });

  it('picks the best count when several Accurate dice are available', () => {
    // 2 Accurate dice, 2 promotions, 3 dice at 2+ never-crit: every rolled norm becomes a crit,
    // so rolling all three (retaining none) is best: 3 * 5/6 * 4 = 10
    const atk = new Model(3, 2, 3, 4).setProp('lethal', 7)
      .setProp('normsToCrits', 3).setProp('autoNorms', 2);

    expect(avgDmg(atk, noSaves)).toBeCloseTo(3 * (5 / 6) * 4, requiredPrecision);
  });
});

describe(calcDmgProbs.name + ', defender chitin', () => {
  it('chitin, 1 atk die & 1 def die', () => {
    const atk = newTestAttacker(1, 4);
    const def = new Model(1, 4).setProp('reroll', Ability.Balanced); // 1 def die, save 4+
    const [pc, pn, pf] = atk.toAttackerDieProbs().toCritNormFail();

    const dmgs = calcDmgProbs(atk, def);
    expect(dmgs.get(atk.critDmg)).toBeCloseTo(pc * (pf * (1 - pc) + pn), requiredPrecision);
    expect(dmgs.get(atk.normDmg)).toBeCloseTo(pn * pf * pf, requiredPrecision);
    expect(dmgs.get(0)).toEqual(expect.any(Number)); // prob is just remainder
    expect(dmgs.size).toBe(3);
  });
});

describe(calcDmgProbs.name + ', multiple rounds', () => {
  it('damage should scale linearly', () => {
    const atk = newTestAttacker(3);
    const def = Model.basicDefender();
    const dmgHist = [];

    for(const numRounds of range(1, 6)) {
      dmgHist.push(avgDmg(atk, def, numRounds));
      expect(dmgHist[dmgHist.length - 1]).toBeCloseTo(dmgHist[0] * numRounds, requiredPrecision);
    }
  });
});

// Indomitus (defender): two or more failed saves discard one fail and turn another
// into a normal save. One application, on any fail faces, including the Piercing Crits path.
describe(calcDmgProbs.name + ', defender Indomitus', () => {
  it('two fails become one normal save', () => {
    // 2 always-normal hits vs 2 dice, save 4+ (crit 1/6, norm 2/6, fail 3/6).
    // A normal or critical save cancels one of those hits. 36 equally likely face-pairs.
    // Both fail is (3/6)*(3/6) = 9/36. Off, that deals 2*normDmg. On, those two fails
    // become one normal save, so one hit remains (normDmg) and 2*normDmg is impossible.
    //   Off: P(0)=9/36, P(normDmg)=18/36, P(2*normDmg)=9/36
    //   On:  P(0)=9/36, P(normDmg)=27/36, P(2*normDmg)=0
    const atk = newTestAttacker(2).withAlwaysNorm();
    const defOff = new Model(2, 4);
    const defOn = new Model(2, 4).setAbility(Ability.Indomitus);
    const dn = atk.normDmg;

    const off = calcDmgProbs(atk, defOff);
    const on = calcDmgProbs(atk, defOn);

    expect(off.get(0)).toBeCloseTo(9 / 36, requiredPrecision);
    expect(off.get(dn)).toBeCloseTo(18 / 36, requiredPrecision);
    expect(off.get(2 * dn)).toBeCloseTo(9 / 36, requiredPrecision);

    expect(on.get(0)).toBeCloseTo(9 / 36, requiredPrecision);
    expect(on.get(dn)).toBeCloseTo(27 / 36, requiredPrecision);
    expect(on.get(2 * dn)).toBeUndefined();
    expect(on.size).toBe(2);
  });

  it('does nothing when fewer than two dice can fail', () => {
    // One defence die fails at most once, so Indomitus never fires and matches the ability off.
    // Same 2 always-normal hits, save 4+: fail (3/6) leaves both hits; a save (3/6) cancels one.
    const atk = newTestAttacker(2).withAlwaysNorm();
    const defOff = new Model(1, 4);
    const defOn = new Model(1, 4).setAbility(Ability.Indomitus);
    const dn = atk.normDmg;

    const off = calcDmgProbs(atk, defOff);
    const on = calcDmgProbs(atk, defOn);

    expect(on.get(2 * dn)).toBeCloseTo(3 / 6, requiredPrecision);
    expect(on.get(dn)).toBeCloseTo(3 / 6, requiredPrecision);
    expect(on.get(0)).toBeUndefined();
    expect(on.size).toBe(2);
    expect(on).toStrictEqual(off);
  });

  it('still converts two fails on the Piercing Crits save path', () => {
    // Always-crit with Px 1 against 4 dice, save 4+. The crit takes the Px branch, which
    // rolls 3 dice (not 4). One crit save or two normal saves cancel the hit.
    // Indomitus adds one normal when a roll has two or more fails, so the only roll it
    // newly saves is (0 crit, 1 norm, 2 fail): 3*(2/6)*(3/6)^2 = 54/216.
    // Triple fail becomes one normal and still lets the crit through: 3^3/216 = 27/216.
    //   Off: P(critDmg)=81/216. On: P(critDmg)=27/216.
    // The non-Px branch (all 4 dice, Indomitus on) would be 3^4/1296 = 1/16, not 1/8.
    const atk = newTestAttacker(1).withAlwaysCrit().setProp('px', 1);
    const defOff = new Model(4, 4);
    const defOn = new Model(4, 4).setAbility(Ability.Indomitus);
    const dc = atk.critDmg;

    const off = calcDmgProbs(atk, defOff);
    const on = calcDmgProbs(atk, defOn);

    expect(off.get(dc)).toBeCloseTo(81 / 216, requiredPrecision);
    expect(off.get(0)).toBeCloseTo(1 - 81 / 216, requiredPrecision);
    expect(on.get(dc)).toBeCloseTo(27 / 216, requiredPrecision);
    expect(on.get(0)).toBeCloseTo(1 - 27 / 216, requiredPrecision);
    expect(on.size).toBe(2);
  });
});

/*
describe('q', () => {
  it('x', () => {
    expect(0).toBe(0);
  });
});
*/

// JaS (Normals) cancels one normal hit before saves. JaS (Crits), when also on, has already
// chosen which single hit to cancel; this scratch then takes one normal that is still there.
describe(calcDamage.name + ', JustAScratchNorms drops one normal before saves', () => {
  const norms = new Model().setAbility(Ability.JustAScratchNorms);
  const both = new Model().setAbility(Ability.JustAScratch).setAbility(Ability.JustAScratchNorms);

  it('normals only: one normal is removed', () => {
    // 0 crit, 2 normal, no saves. One normal cancelled, one left: 1 * 3 = 3.
    const atker = new Model(0, 0, 3, 5, 0);
    const r = calcDamage(atker, norms, 0, 2, 0, 0);
    expect(r.damage).toBe(3);
    expect(r.survivingCritHits).toBe(0);
    expect(r.survivingNormHits).toBe(1);
  });

  it('crits only: unchanged', () => {
    // 2 crit, 0 normal. No normal to cancel: 2 * 5 = 10.
    const atker = new Model(0, 0, 3, 5, 0);
    const r = calcDamage(atker, norms, 2, 0, 0, 0);
    expect(r.damage).toBe(10);
    expect(r.survivingCritHits).toBe(2);
    expect(r.survivingNormHits).toBe(0);
  });

  it('both scratches on 1 crit + 1 normal cancel both hits', () => {
    // JaS (Crits) tries each hit. Cancelling the crit leaves the normal for JaS (Normals): 0.
    // Cancelling the normal first leaves the crit: 5. The lower result is 0.
    const atker = new Model(0, 0, 3, 5, 0);
    const r = calcDamage(atker, both, 1, 1, 0, 0);
    expect(r.damage).toBe(0);
    expect(r.survivingCritHits).toBe(0);
    expect(r.survivingNormHits).toBe(0);
  });

  it('1 normal hit + 1 normal save is 0', () => {
    // The only normal is cancelled before the save is spent, so nothing remains: 0.
    const atker = new Model(0, 0, 3, 5, 0);
    expect(calcDamage(atker, norms, 0, 1, 0, 1).damage).toBe(0);
  });

  it('drops the normal before saves, so two normal saves can still cancel a crit', () => {
    // crit 2 < norm 5. 1 crit + 1 normal vs 2 normal saves.
    // Cancel the normal first and the two saves cancel the crit: 0.
    // Spending the saves first would use one on the normal and leave the crit for 2.
    const atker = new Model(0, 0, 5, 2, 0);
    expect(calcDamage(atker, norms, 1, 1, 0, 2).damage).toBe(0);
  });

  for (const withJas of [false, true]) {
    it(`matches brute force for every 0-3 hits/saves split, JaS (Normals)${withJas ? ' and JaS (Crits)' : ''}`, () => {
      expectMatchesBruteForce(withJas ? both : norms);
    });
  }
});
