import Model from 'src/Model';
import {
  calcRemainingWounds,
} from 'src/CalcEngineFight';
import {
  calcDieChoice,
  calcParryForLastEnemySuccessThenKillEnemy,
  calcRemainingWoundPairProbs,
  consolidateWoundPairProbs,
  handleDuelist,
  injuredHitStat,
  preferredStrikeChoice,
  resolveDieChoice,
  resolveFight,
  toWoundPairKey,
  wiseParry,
} from 'src/CalcEngineFightInternal';
import { mulberry32 } from 'src/MonteCarloFightDice';
import {clone, range} from 'lodash';
import FightStrategy from 'src/FightStrategy';
import FightChoice from 'src/FightChoice';
import FighterState from 'src/FighterState';
import Ability from 'src/Ability';
import * as Util from 'src/Util';
import {
  SaintlyRelicsInspiring,
  SaintlyRelicsNormal,
  SaintlyRelicsOff,
} from 'src/SaintlyRelics';

const requiredPrecision = 1; // Monte Carlo tolerance (within 0.05)
const highSimCount = 200_000;
const testRng = () => mulberry32(12345);

function newFighterState(
  crits: number,
  norms: number,
  wounds: number = 3,
  strategy: FightStrategy = FightStrategy.MaxDmgToEnemy,
  abilities: Set<Ability> = new Set<Ability>(),
): FighterState {
  return new FighterState(
    new Model(crits + norms, 2, 1, 2)
      .setProp('wounds', wounds)
      .setProp('abilities', abilities),
    crits,
    norms,
    strategy,
  );
}

// The strike-vs-parry lookahead clones both fighters and resolves throwaway fights to compare the
// options. Those clones must not hold the live rng: draws taken inside an estimate would be missing
// from the real resolution, desynchronizing the Common Random Numbers streams the Fight engine
// relies on for stable comparisons.
describe('calcDieChoice lookahead does not consume rng draws', () => {
  function countingRngFighters(strategy: FightStrategy) {
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    // fnp gives the lookahead's resolveFight a reason to roll, so a leak shows up as draws > 0
    const chooserProfile = new Model(2, 2, 1, 2).setProp('wounds', 6).setProp('fnp', 4);
    const enemyProfile = new Model(2, 2, 1, 2).setProp('wounds', 6).setProp('fnp', 4);
    const chooser = new FighterState(chooserProfile, 1, 1, strategy, 6, false, false, rng);
    const enemy = new FighterState(enemyProfile, 1, 1, FightStrategy.Strike, 6, false, false, rng);
    return { chooser, enemy, draws: () => draws };
  }

  it.each([
    ['MaxDmgToEnemy', FightStrategy.MaxDmgToEnemy],
    ['MinDmgToSelf', FightStrategy.MinDmgToSelf],
  ])('%s: choosing a die takes no rng draws', (_name, strategy) => {
    const { chooser, enemy, draws } = countingRngFighters(strategy as FightStrategy);
    calcDieChoice(chooser, enemy);
    expect(draws()).toBe(0);
  });

  // The lookahead must still ACCOUNT for damage prevention — an estimate that ignores Feel No Pain
  // or Saintly Relics compares damage the defender would in fact have prevented, and can pick the
  // wrong die. Estimate clones apply prevention as its expected value instead of rolling it.
  describe('estimate clones model prevention without rolling', () => {
    function estimateOf(profile: Model) {
      const live = new FighterState(profile, 1, 0, FightStrategy.Strike, 10, false, false, () => {
        throw new Error('estimate clone must not draw from the rng');
      });
      return { live, estimate: live.asEstimate() };
    }

    it('applies Feel No Pain as its expected reduction', () => {
      // fnp 4+ succeeds on 3 of 6, so a 3-damage strike is expected to land 3 - 0.5
      const { estimate } = estimateOf(new Model(1, 3, 1, 2).setProp('wounds', 10).setProp('fnp', 4));
      estimate.applyDmg(3);
      expect(estimate.currentWounds).toBeCloseTo(10 - 2.5, 6);
    });

    it('applies Saintly Relics as its expected reduction', () => {
      // 1 D6 ignoring the whole strike on a 6: expected damage is 3 * 5/6
      const { estimate } = estimateOf(
        new Model(1, 3, 1, 2).setProp('wounds', 10).setProp('saintlyRelics', SaintlyRelicsNormal));
      estimate.applyDmg(3);
      expect(estimate.currentWounds).toBeCloseTo(10 - 3 * (5 / 6), 6);
    });

    it('spends the relic across strikes instead of re-offering it at full odds', () => {
      // The ignore is consumed by a SUCCESSFUL roll, so a later strike is only protected if every
      // earlier attempt failed. Two 3-damage strikes, ignore on a 6 (p = 1/6):
      //   strike 1: 3 * (1 - 1/6)                     = 2.5
      //   strike 2: 3 * (1 - (5/6)(1/6))              = 2.5833...
      // Applying the full ignore chance to both would give 5.0, crediting a relic already spent.
      const { estimate } = estimateOf(
        new Model(1, 3, 1, 2).setProp('saintlyRelics', SaintlyRelicsNormal));
      const p = 1 / 6;

      estimate.applyDmg(3);
      estimate.applyDmg(3);

      const expected = 3 * (1 - p) + 3 * (1 - (1 - p) * p);
      const dealt = 10 - estimate.currentWounds; // estimateOf starts clones on 10 wounds
      expect(dealt).toBeCloseTo(expected, 6);
      expect(dealt).toBeGreaterThan(2 * 3 * (1 - p)); // strictly above the naive 5.0
    });

    it('matches the exact expectation over two relic-eligible strikes', () => {
      // independent check of the same two strikes, enumerated rather than derived:
      // strike 2 is protected only if strike 1's attempt failed, otherwise it takes full damage
      const { estimate } = estimateOf(
        new Model(1, 3, 1, 2).setProp('saintlyRelics', SaintlyRelicsNormal));
      const p = 1 / 6;
      const exact = 3 * (1 - p) + ((1 - p) * (3 * (1 - p)) + p * 3);

      estimate.applyDmg(3);
      estimate.applyDmg(3);

      expect(10 - estimate.currentWounds).toBeCloseTo(exact, 6);
    });

    it('composes relics and Feel No Pain without double-counting prevention', () => {
      // FNP only rolls on a strike the relic did NOT ignore, so the two compose as
      // P(not ignored) * E[damage after FNP] = (5/6) * (3 - 1/2) = 2.0833...
      // Subtracting FNP from already-relic-scaled damage would give 2.5 - 0.5 = 2.0, spending FNP
      // on the probability mass where the strike had been wiped out entirely.
      const { estimate } = estimateOf(new Model(1, 3, 1, 2)
        .setProp('fnp', 4).setProp('saintlyRelics', SaintlyRelicsNormal));

      estimate.applyDmg(3);

      expect(10 - estimate.currentWounds).toBeCloseTo((1 - 1 / 6) * (3 - 0.5), 6);
    });

    it('ignores prevention it does not have', () => {
      const { estimate } = estimateOf(new Model(1, 3, 1, 2).setProp('wounds', 10));
      estimate.applyDmg(3);
      expect(estimate.currentWounds).toBe(7);
    });

    it('never draws from the rng, and leaves the live fighter alone', () => {
      const { live, estimate } = estimateOf(
        new Model(1, 3, 1, 2).setProp('wounds', 10).setProp('fnp', 4));
      expect(estimate.rng).toBeNull();
      estimate.applyDmg(3); // the live rng throws if touched
      expect(live.currentWounds).toBe(10);
      expect(live.rng).not.toBeNull();
    });

    it('stays an estimate through nested clones', () => {
      const { estimate } = estimateOf(new Model(1, 3, 1, 2).setProp('wounds', 10).setProp('fnp', 4));
      const nested = estimate.clone();
      nested.applyDmg(3);
      expect(nested.currentWounds).toBeCloseTo(10 - 2.5, 6);
    });
  });

  it('is deterministic — the same position always yields the same choice', () => {
    const first = countingRngFighters(FightStrategy.MaxDmgToEnemy);
    const second = countingRngFighters(FightStrategy.MaxDmgToEnemy);
    expect(calcDieChoice(first.chooser, first.enemy))
      .toBe(calcDieChoice(second.chooser, second.enemy));
  });

  it('leaves the real fighters untouched (rng still attached, wounds unchanged)', () => {
    const { chooser, enemy } = countingRngFighters(FightStrategy.MaxDmgToEnemy);
    const chooserRng = chooser.rng;
    const enemyRng = enemy.rng;
    calcDieChoice(chooser, enemy);
    // toBe, not just non-null: swapping in a different rng would also leave it non-null
    expect(chooser.rng).toBe(chooserRng);
    expect(enemy.rng).toBe(enemyRng);
    expect(chooser.currentWounds).toBe(6);
    expect(enemy.currentWounds).toBe(6);
  });
});

describe(wiseParry.name, () => {
  const guy1n = newFighterState(0, 1);
  const guy1c = newFighterState(1, 0);
  const guy1c1n = newFighterState(1, 1);
  const guy1nBrutal = newFighterState(0, 1);
  const guy1cBrutal = newFighterState(1, 0);
  guy1nBrutal.profile.setAbility(Ability.Brutal, true);
  guy1cBrutal.profile.setAbility(Ability.Brutal, true);

  it('1n vs 1n => norm parry', () => {
    expect(wiseParry(guy1n, guy1n)).toBe(FightChoice.NormParry);
  });
  it('1n vs 1n brutal => norm strike', () => {
    expect(wiseParry(guy1n, guy1nBrutal)).toBe(FightChoice.NormStrike);
  });
  it('1n vs 1c => norm strike', () => {
    expect(wiseParry(guy1n, guy1c)).toBe(FightChoice.NormStrike);
  });
  it('1n vs 1c brutal => norm strike', () => {
    expect(wiseParry(guy1n, guy1cBrutal)).toBe(FightChoice.NormStrike);
  });
  it('1n vs 1c+1n => norm parry', () => {
    expect(wiseParry(guy1n, guy1c1n)).toBe(FightChoice.NormParry);
  });
  it('1c vs 1n => crit parry', () => {
    expect(wiseParry(guy1c, guy1n)).toBe(FightChoice.CritParry);
  });
  it('1c vs 1n brutal => crit parry', () => {
    expect(wiseParry(guy1c, guy1nBrutal)).toBe(FightChoice.CritParry);
  });
  it('1c vs 1c => crit parry', () => {
    expect(wiseParry(guy1c, guy1c)).toBe(FightChoice.CritParry);
  });
  it('1c vs 1c brutal => crit parry', () => {
    expect(wiseParry(guy1c, guy1cBrutal)).toBe(FightChoice.CritParry);
  });
  it('1c vs 1c+1n => crit parry', () => {
    expect(wiseParry(guy1c, guy1c1n)).toBe(FightChoice.CritParry);
  });
  it('1c+1n vs 1n => norm parry', () => {
    expect(wiseParry(guy1c1n, guy1n)).toBe(FightChoice.NormParry);
  });
  it('1c+1n vs 1n brutal => crit parry', () => {
    expect(wiseParry(guy1c1n, guy1nBrutal)).toBe(FightChoice.CritParry);
  });
  it('1c+1n vs 1c => crit parry', () => {
    expect(wiseParry(guy1c1n, guy1c)).toBe(FightChoice.CritParry);
  });
  it('1c+1n vs 1c+1n => crit parry', () => {
    expect(wiseParry(guy1c1n, guy1c1n)).toBe(FightChoice.CritParry);
  });
});

describe(calcParryForLastEnemySuccessThenKillEnemy.name, () => {
  const guy99 = newFighterState(9, 9);
  guy99.profile.critDmg = 3;
  guy99.profile.normDmg = 2;

  it('no parry because multiple enemy success', () => {
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(1, 1))).toBe(null);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(0, 2))).toBe(null);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(2, 0))).toBe(null);
  });
  it('no parry because too much enemy health', () => {
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(0, 1, guy99.totalDmg()))).toBe(null);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(0, 1, guy99.totalDmg() - guy99.profile.normDmg + 1))).toBe(null);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(1, 0, guy99.totalDmg() - guy99.profile.critDmg + 1))).toBe(null);
  });
  it('typical norm parry', () => {
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(0, 1))).toBe(FightChoice.NormParry);
  });
  it('brutal requiring crit parry instead of norm parry', () => {
    const guy01Brutal = newFighterState(0, 1);
    guy01Brutal.profile.setAbility(Ability.Brutal, true);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, guy01Brutal)).toBe(FightChoice.CritParry);
  });
  it('typical crit parry', () => {
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99, newFighterState(1, 0))).toBe(FightChoice.CritParry);
  });
  it('crit and norm parry with storm shield', () => {
    const guy99Storm = newFighterState(9, 9);
    guy99Storm.profile.abilities.add(Ability.StormShield2021);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Storm, newFighterState(2, 0))).toBe(FightChoice.CritParry);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Storm, newFighterState(1, 1))).toBe(FightChoice.CritParry);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Storm, newFighterState(0, 2))).toBe(FightChoice.NormParry);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Storm, newFighterState(1, 2))).toBe(null);
  });
  it('crit parry with Dueller', () => {
    const guy99Dueller = newFighterState(9, 9);
    guy99Dueller.profile.abilities.add(Ability.Dueller);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Dueller, newFighterState(2, 0))).toBe(null);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Dueller, newFighterState(1, 1))).toBe(FightChoice.CritParry);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Dueller, newFighterState(0, 2))).toBe(FightChoice.CritParry);
    expect(calcParryForLastEnemySuccessThenKillEnemy(guy99Dueller, newFighterState(1, 2))).toBe(null);
  });
  it('HalfDamageFirstStrike enemy: lookahead must account for halved post-parry strike', () => {
    // chooser: 2 crits @ critDmg 3. enemy: 1 crit. CritParry leaves chooser 1 crit.
    // Without HalfDamageFirstStrike that lone strike does 3 dmg -> kills a 3-wound enemy.
    // With it, the (first) post-parry strike is halved to ceil(3/2)=2 -> cannot kill 3 wounds.
    // The old arithmetic ignored HalfDamageFirstStrike and wrongly chose to parry here.
    const chooser = newFighterState(2, 0);
    chooser.profile.critDmg = 3;

    const enemyNoHalf = newFighterState(1, 0, 3);
    expect(calcParryForLastEnemySuccessThenKillEnemy(chooser, enemyNoHalf)).toBe(FightChoice.CritParry);

    const enemyHalf = newFighterState(1, 0, 3);
    enemyHalf.profile.setAbility(Ability.HalfDamageFirstStrike, true);
    expect(calcParryForLastEnemySuccessThenKillEnemy(chooser, enemyHalf)).toBe(null);

    // but a 2-wound HalfDamageFirstStrike enemy still dies to the halved 2-dmg strike
    const enemyHalf2 = newFighterState(1, 0, 2);
    enemyHalf2.profile.setAbility(Ability.HalfDamageFirstStrike, true);
    expect(calcParryForLastEnemySuccessThenKillEnemy(chooser, enemyHalf2)).toBe(FightChoice.CritParry);
  });

  it('Just a Scratch: parry, then a normal-first follow-up, kills when crit-first does not', () => {
    // Strike: 1 crit (4) + 3 normals (3), 4 wounds. Defender: 1 normal (4), 7 wounds, Just a Scratch.
    // After parrying that normal, crit-first is scratched and the two remaining normals deal 3+3,
    // leaving the defender on 1. Leading with a normal feeds the scratch a 3; the crit and the
    // other normal then deal 4+3 and the defender dies. The attacker never takes the 4.
    const attacker = newFighterState(1, 3, 4, FightStrategy.Strike);
    attacker.profile.critDmg = 4;
    attacker.profile.normDmg = 3;
    const defender = newFighterState(
      0, 1, 7, FightStrategy.Strike, new Set<Ability>([Ability.JustAScratch]));
    defender.profile.normDmg = 4;

    expect(calcParryForLastEnemySuccessThenKillEnemy(attacker, defender)).toBe(FightChoice.NormParry);
    resolveFight(attacker, defender);
    expect(attacker.currentWounds).toBe(4);
    expect(defender.currentWounds).toBe(0);
  });

  it('Half Damage: parry, then a normal-first follow-up, kills when crit-first does not', () => {
    // Strike: 1 crit (5) + 2 normals (2), 3 wounds. Defender: 1 normal (3), 6 wounds,
    // Half Damage on the first strike. Crit-first after the parry is ceil(5/2)+2 = 5, short of 6.
    // A normal is already at the half-damage floor (2), so leading with it leaves the full crit:
    // 2+5 kills. Striking the crit instead lets the defender's 3 finish the attacker.
    const attacker = newFighterState(1, 2, 3, FightStrategy.Strike);
    attacker.profile.critDmg = 5;
    attacker.profile.normDmg = 2;
    const defender = newFighterState(
      0, 1, 6, FightStrategy.Strike, new Set<Ability>([Ability.HalfDamageFirstStrike]));
    defender.profile.normDmg = 3;

    expect(calcParryForLastEnemySuccessThenKillEnemy(attacker, defender)).toBe(FightChoice.NormParry);
    resolveFight(attacker, defender);
    expect(attacker.currentWounds).toBe(3);
    expect(defender.currentWounds).toBe(0);
  });
});

describe(calcDieChoice.name + ', common & strike/parry', () => {
  it('#0: strike if enemy has no successes (parry would cancel nothing)', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.Parry);
    const enemy = newFighterState(0, 0, 99);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('#0b: strike if enemy has no successes, chooser only norms', () => {
    const chooser = newFighterState(0, 1, 99, FightStrategy.Parry);
    const enemy = newFighterState(0, 0, 99);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
  });
  it('#1a: strike if you can kill with next strike', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.Parry);
    const enemy = newFighterState(9, 9, chooser.profile.critDmg);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('#1b: strike if you can kill with next strike (hammerhand)', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.Parry, new Set<Ability>([Ability.Hammerhand2021]));
    const enemy = newFighterState(9, 9, chooser.profile.critDmg + 1);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('#2a: crit strike if you have shock, enemy is not already shocked, and enemy has no crit successes', () => {
    const chooser = newFighterState(99, 99, 99, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(0, 99, 20);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('#2b: if enemy already shocked, then cannot shock again', () => {
    const chooser = newFighterState(99, 99, 99, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    chooser.hasCritStruck = true;
    const enemy = newFighterState(0, 99, 20);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormParry);
  });
  it('#2c: if chooser has shock and enemy has crit successes, that is not enough to override Parry strategy', () => {
    const chooser = newFighterState(99, 99, 99, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(99, 99, 20);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
  });
  it('#2d: Parry shock-strikes a crit-only enemy, because that strike discards a crit', () => {
    // Shock discards a normal if the enemy has one, otherwise a crit. Against a crit-only
    // opponent the discard removes a crit and still deals damage, so it beats a plain parry.
    // The enemy having crits must not keep a Parry fighter parrying when they have no normals.
    const chooser = newFighterState(1, 0, 99, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(2, 0, 99);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('#2e: a mixed hand still shock-strikes the crit against a crit-only enemy', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(1, 0, 99);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('#2f: already shocked, a crit-only enemy does not force another strike under Parry', () => {
    const chooser = newFighterState(1, 0, 99, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    chooser.hasCritStruck = true;
    const enemy = newFighterState(2, 0, 99);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
  });
  it('#3: parry if can parry last enemy success and still kill them', () => {
    const chooser = newFighterState(99, 99, 99, FightStrategy.Strike);
    const enemy = newFighterState(1, 0, 20);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
  });
  it('MaxDmgToEnemy, parry lets you survive to give more damage', () => {
    const chooser = newFighterState(10, 0, 2, FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(1, 1, 10, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
  });
  it('MaxDmgToEnemy, you\'re going to die, so strike', () => {
    const chooser = newFighterState(10, 10, 1, FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(1, 1, 10, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('MinDmgToSelf, you\'re going to die, so strike', () => {
    const chooser = newFighterState(10, 10, 1, FightStrategy.MinDmgToSelf);
    const enemy = newFighterState(1, 1, 10, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('MinDmgToSelf, do not use shocking crit strike if could have used that crit to parry an enemy crit', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.MinDmgToSelf, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(1, 1, 99, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
  });
});

describe(calcDieChoice.name + ', lethal strike respects damage prevention', () => {
  function scratchMatchup(strategy = FightStrategy.MaxDmgToEnemy) {
    const chooser = new FighterState(
      new Model(3, 6, 3, 4).setProp('wounds', 3), 2, 1, strategy);
    const enemy = new FighterState(
      new Model(1, 6, 3, 4).setProp('wounds', 4).setAbility(Ability.JustAScratch),
      0, 1, FightStrategy.Strike);
    return { chooser, enemy };
  }

  it.each([FightStrategy.MaxDmgToEnemy, FightStrategy.MinDmgToSelf])(
    '%s: parries instead of wasting an apparently lethal crit on Just a Scratch', strategy => {
      // A: 3 wounds, 2 crits + 1 norm, damage 3/4. B: 4 wounds, 1 norm, JaS.
      // Striking first gets scratched, then B kills A. Parrying the normal instead
      // removes B's only attack; A's first crit is scratched and its second kills B.
      const { chooser, enemy } = scratchMatchup(strategy);
      expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormParry);
      resolveFight(chooser, enemy);
      expect(chooser.currentWounds).toBe(3);
      expect(enemy.currentWounds).toBe(0);
    });

  it('changes the full simulation distribution for guaranteed retained dice', () => {
    const { chooser, enemy } = scratchMatchup();
    chooser.profile.setProp('autoCrits', 2).setProp('autoNorms', 1);
    enemy.profile.setProp('autoNorms', 1);
    const outcomes = calcRemainingWoundPairProbs(
      chooser.profile, enemy.profile, chooser.strategy, enemy.strategy, 1, 8, 12345);
    expect(outcomes).toEqual(new Map([[toWoundPairKey(3, 0), 1]]));
  });

  // Positive controls: a real killing blow must still override the Parry strategy.
  it.each([false, true])('still strikes when Just a Scratch is absent or spent (spent=%s)', spent => {
    const { chooser, enemy } = scratchMatchup(FightStrategy.Parry);
    if (spent) chooser.hasStruck = true;
    else enemy.profile.setAbility(Ability.JustAScratch, false);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
    resolveFight(chooser, enemy);
    expect(chooser.currentWounds).toBe(3);
    expect(enemy.currentWounds).toBe(0);
  });

  it('does not treat a scratched normal as a killing blow', () => {
    const chooser = newFighterState(0, 2, 3, FightStrategy.Parry);
    const enemy = newFighterState(0, 2, 1);
    enemy.profile.setAbility(Ability.JustAScratchNorms);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormParry);
  });

  it('accounts for halving the first strike before taking the lethal shortcut', () => {
    const chooser = newFighterState(1, 1, 10, FightStrategy.Parry);
    chooser.profile.critDmg = 4;
    const enemy = newFighterState(2, 0, 4);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
  });

  it('Parry strikes when a Murderous Entrance bonus normal kills and a second crit would not', () => {
    // 1 crit at 2, 1 normal at 5, enemy on 6 with 1 normal, no Shock. The bonus die is
    // the normal, so the crit plus that normal is 7 and lands before the enemy acts.
    // Pricing the bonus as another crit (4) skips the lethal check. Parrying spends the
    // normal and leaves a 2-damage crit, which also fails the parry-then-kill check.
    const chooser = newFighterState(1, 1, 10, FightStrategy.Parry,
      new Set<Ability>([Ability.MurderousEntrance2021]));
    chooser.profile.critDmg = 2;
    chooser.profile.normDmg = 5;
    const enemy = newFighterState(0, 1, 6, FightStrategy.Strike);

    expect(chooser.nextDmg()).toBe(7);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);

    resolveFight(chooser, enemy);
    expect(enemy.currentWounds).toBe(0);
    expect(chooser.currentWounds).toBe(10);
  });

  it('prices a Murderous Entrance bonus as the die that is actually spent', () => {
    const withBonus = (crits: number, norms: number, critStruck = false) => {
      const chooser = newFighterState(crits, norms, 10, FightStrategy.Parry,
        new Set<Ability>([Ability.MurderousEntrance2021]));
      chooser.profile.critDmg = 2;
      chooser.profile.normDmg = 5;
      chooser.hasCritStruck = critStruck;
      return chooser;
    };

    // A second crit is the follow-up, not the fatter normal.
    expect(withBonus(2, 1).nextDmg()).toBe(4);
    // No second success: the ploy does not invent a die.
    expect(withBonus(1, 0).nextDmg()).toBe(2);
    // Already spent: no further bonus.
    expect(withBonus(1, 1, true).nextDmg()).toBe(2);
    // Hammerhand stays on the first strike: 2 + 1 + bonus normal 5.
    const hammer = withBonus(1, 1);
    hammer.profile.setAbility(Ability.Hammerhand2021, true);
    expect(hammer.nextDmg()).toBe(8);
  });

  it('Parry still parries when the Murderous Entrance bonus normal is not lethal', () => {
    const chooser = newFighterState(1, 1, 10, FightStrategy.Parry,
      new Set<Ability>([Ability.MurderousEntrance2021]));
    chooser.profile.critDmg = 2;
    chooser.profile.normDmg = 5;
    const enemy = newFighterState(0, 1, 8, FightStrategy.Strike);

    expect(chooser.nextDmg()).toBe(7);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormParry);
  });

  it('estimates a potentially lethal strike without consuming rng or changing live state', () => {
    const chooser = newFighterState(1, 0, 10, FightStrategy.Parry);
    const enemy = newFighterState(2, 0, 2);
    enemy.profile.fnp = 4;
    const rng = jest.fn(() => 0.5);
    chooser.rng = rng;
    enemy.rng = rng;
    const beforeChooser = chooser.clone();
    const beforeEnemy = enemy.clone();
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritParry);
    expect(rng).not.toHaveBeenCalled();
    expect(chooser).toEqual(beforeChooser);
    expect(enemy).toEqual(beforeEnemy);
  });
});

describe(calcDieChoice.name + ', norm-first to deny a normal parry', () => {
  // A normal parry can cancel only a normal (it can't touch a crit). So when we hold both a
  // crit and a norm and the enemy has no crits, striking the NORM first forces it through
  // before the enemy can parry it, while our crit stays unparryable.
  it('strikes norm-first vs a parrying enemy with norms-only (denies the parry)', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(0, 2, 99, FightStrategy.Parry);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
  });
  it('Strike strategy also strikes norm-first when the enemy will parry a norm', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.Strike);
    const enemy = newFighterState(0, 2, 99, FightStrategy.Parry);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
  });
  it('stays crit-first when the enemy holds a crit (a crit parry can cancel our crit)', () => {
    const chooser = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(1, 1, 99, FightStrategy.Parry);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('stays crit-first in a death-race vs a striking enemy (front-load the bigger die)', () => {
    // We die after one enemy strike, so we only get one strike in — land the crit (2), not the
    // norm (1). The enemy is striking (not parrying), so there's no parry to deny. crit-first
    // leaves the enemy lower even though it has no crits.
    const chooser = newFighterState(1, 1, 1, FightStrategy.Strike);
    const enemy = newFighterState(0, 2, 5, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('end-to-end: norm-first pushes both dice past a parrying defender', () => {
    // newFighterState uses normDmg=1, critDmg=2. Optimal is 3 (both land); crit-first would
    // leave the lone norm to be parried for only 2.
    const atk = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy);
    const def = newFighterState(0, 2, 99, FightStrategy.Parry);
    resolveFight(atk, def);
    expect(def.currentWounds).toBe(99 - (atk.profile.critDmg + atk.profile.normDmg));
  });
  it('Shock with a mixed hand still routes through the norm-first chooser vs a parrying enemy', () => {
    // The Shock short-circuit must not force crit-first here: striking the norm first still lets
    // the crit (and its shock) land later, while denying the enemy's normal parry. crit-first
    // would leave the lone norm to be parried.
    const chooser = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(0, 2, 99, FightStrategy.Parry);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
  });
  it('Shock with only crits (no norm to reorder) still takes the shocking crit strike', () => {
    const chooser = newFighterState(2, 0, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.Shock]));
    const enemy = newFighterState(0, 2, 99, FightStrategy.Parry);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('a lethal crit strikes crit-first even in the norm-first shape (land the killing blow)', () => {
    // Norm-first shape (mixed hand, parrying norms-only enemy) — but the crit kills this turn, so
    // the lethal-strike rule must win and land the crit now rather than deferring the kill.
    const chooser = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(0, 2, chooser.profile.critDmg, FightStrategy.Parry);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
  it('exhausted defender with Just a Scratch: strike norm-first so the crit lands second', () => {
    // Enemy has no successes (can't parry) but JaS zeroes our FIRST strike. crit-first wastes the
    // crit; norm-first feeds JaS the smaller norm and lands the crit. Order matters even with no
    // enemy successes, so this forced-strike exit must route through preferredStrikeChoice.
    const chooser = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(0, 0, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.JustAScratch]));
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
  });
  it('MinDmgToSelf scorer: order is self-damage-neutral here, so it keeps crit-first', () => {
    // preferredStrikeChoice's MinDmgToSelf branch compares the chooser's own surviving wounds.
    // Striking order doesn't change how many enemy dice strike back, so the two orders tie and
    // crit-first (front-loading the bigger die) is kept. This pins the self-preservation branch.
    const chooser = newFighterState(1, 1, 99, FightStrategy.MinDmgToSelf);
    const enemy = newFighterState(0, 2, 99, FightStrategy.Parry);
    expect(preferredStrikeChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
});

describe('both-orders simulation still runs when the enemy holds a crit', () => {
  // An enemy crit used to skip preferredStrikeChoice's both-orders simulation entirely, so the
  // engine always struck crit-first. That is wrong when the first strike is zeroed or halved,
  // or when the normal is the bigger die: norm-first can land strictly more damage. Crit-first
  // stays on a tie, and when the enemy's crit would parry ours if we led with the normal.

  function mixedHand(
    strategy: FightStrategy,
    abilities: Ability[] = [],
  ): FighterState {
    const chooser = newFighterState(1, 1, 99, strategy, new Set<Ability>(abilities));
    chooser.profile.setProp('critDmg', 5);
    chooser.profile.setProp('normDmg', 2);
    return chooser;
  }

  it('Just a Scratch: strike the normal first so the scratch eats it and the crit lands', () => {
    // 5-damage crit, 2-damage normal, enemy has a crit and JaS, nobody is in lethal range.
    // Crit-first is scratched and the normal lands later (2). Norm-first is scratched and the
    // crit lands (5). The enemy is striking, so they do not parry the remaining die.
    const chooser = mixedHand(FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(1, 0, 99, FightStrategy.Strike, new Set<Ability>([Ability.JustAScratch]));
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);

    resolveFight(chooser, enemy);
    expect(enemy.currentWounds).toBe(99 - chooser.profile.critDmg);
  });

  it('Just a Scratch vs a parrying crit stays crit-first (both orders deal 0)', () => {
    const chooser = mixedHand(FightStrategy.Strike);
    const enemy = newFighterState(1, 0, 99, FightStrategy.Parry, new Set<Ability>([Ability.JustAScratch]));
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });

  it('Half Damage: lead with the normal so the crit is not the die that gets halved', () => {
    const chooser = mixedHand(FightStrategy.MaxDmgToEnemy);
    const enemy = newFighterState(
      1, 0, 99, FightStrategy.Strike, new Set<Ability>([Ability.HalfDamageFirstStrike]));
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);

    resolveFight(chooser, enemy);
    // norm halved to max(2, ceil(2/2)) = 2, then the full crit
    expect(enemy.currentWounds).toBe(99 - chooser.profile.normDmg - chooser.profile.critDmg);
  });

  it('Half Damage in a one-strike death-race stays crit-first', () => {
    // The enemy's crit kills us before a second strike. Halved crit (ceil(5/2)=3) still beats
    // the halved-or-minimum normal (2), so front-loading the crit remains correct.
    const chooser = mixedHand(FightStrategy.Strike);
    chooser.currentWounds = 1;
    const enemy = newFighterState(
      1, 0, 99, FightStrategy.Strike, new Set<Ability>([Ability.HalfDamageFirstStrike]));
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });

  it('Half Damage vs a parrying crit stays crit-first (halved crit beats a halved normal)', () => {
    // Crit-first: halved crit (3) lands, their crit parries the normal. Norm-first: halved
    // normal (2) lands, their crit parries ours. 3 > 2, so crit-first wins.
    const chooser = mixedHand(FightStrategy.Strike);
    const enemy = newFighterState(
      1, 0, 99, FightStrategy.Parry, new Set<Ability>([Ability.HalfDamageFirstStrike]));
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });

  it('Hammerhand with a bigger normal: strike the normal when only one hit will land', () => {
    // norm 5 + Hammerhand = 6, crit 2 + Hammerhand = 3. We die to the enemy's crit before a
    // second strike, so the first die is the only damage we deal.
    const chooser = newFighterState(
      1, 1, 1, FightStrategy.Strike, new Set<Ability>([Ability.Hammerhand2021]));
    chooser.profile.setProp('normDmg', 5);
    chooser.profile.setProp('critDmg', 2);
    const enemy = newFighterState(1, 0, 99, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);

    resolveFight(chooser, enemy);
    expect(enemy.currentWounds).toBe(99 - (5 + 1));
  });

  it('a bigger normal is struck first even without Hammerhand when only one hit lands', () => {
    // Hammerhand's +1 rides on whichever die is first, so the flip is the normal already
    // out-damaging the crit. Same death-race, no Hammerhand: 5 beats 2.
    const chooser = newFighterState(1, 1, 1, FightStrategy.Strike);
    chooser.profile.setProp('normDmg', 5);
    chooser.profile.setProp('critDmg', 2);
    const enemy = newFighterState(1, 0, 99, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
  });

  it('keeps crit-first on a tie when both dice land and Hammerhand applies once either way', () => {
    const chooser = newFighterState(
      1, 1, 99, FightStrategy.Strike, new Set<Ability>([Ability.Hammerhand2021]));
    chooser.profile.setProp('normDmg', 5);
    chooser.profile.setProp('critDmg', 2);
    const enemy = newFighterState(1, 0, 99, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });

  it('Hammerhand does not reorder when the crit is still the bigger die', () => {
    // defaults: normDmg 1, critDmg 2. Hammerhand makes the first strike 2 or 3; the crit wins.
    const chooser = newFighterState(
      1, 1, 1, FightStrategy.Strike, new Set<Ability>([Ability.Hammerhand2021]));
    const enemy = newFighterState(1, 0, 99, FightStrategy.Strike);
    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
});

describe(handleDuelist.name + ' fires only once per fight', () => {
  // Duelist's free parry is once per fight. resolveFight runs handleDuelist at its start, and the
  // lookahead simulations in calcDieChoice / preferredStrikeChoice call resolveFight again on
  // mid-fight clones — without a "spent" flag that would grant the parry a second time.
  it('a second handleDuelist call is a no-op', () => {
    const duelist = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.Duelist]));
    const enemy = newFighterState(0, 2, 99);

    handleDuelist(duelist, enemy);
    expect(duelist.hasDuelistParried).toBe(true);
    expect(enemy.norms).toBe(1); // one norm parried away
    expect(duelist.norms).toBe(0); // spent the norm to parry

    // Re-entrant call (as a cloned lookahead would do) must not parry again.
    handleDuelist(duelist, enemy);
    expect(enemy.norms).toBe(1); // unchanged — no second parry
    expect(duelist.crits).toBe(1); // crit not consumed by a phantom second parry
  });
  it('clone() carries the spent flag so simulations do not re-grant the parry', () => {
    const duelist = newFighterState(1, 1, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.Duelist]));
    const enemy = newFighterState(0, 2, 99);
    handleDuelist(duelist, enemy);

    const clonedDuelist = duelist.clone();
    expect(clonedDuelist.hasDuelistParried).toBe(true);
    handleDuelist(clonedDuelist, enemy.clone());
    expect(clonedDuelist.crits).toBe(1); // still no second parry
  });
  it('only normals vs only crits does not spend a die or the once-per-fight flag', () => {
    // A normal cannot cancel a crit. NormParry would still decrement chooser.norms
    // and cancel nothing (enemy.norms is already 0), and the flag is set before the
    // choice, so the free parry would be gone. Skip both.
    const duelist = newFighterState(0, 2, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.Duelist]));
    const enemy = newFighterState(2, 0, 99);

    handleDuelist(duelist, enemy);

    expect(duelist.norms).toBe(2);
    expect(duelist.crits).toBe(0);
    expect(enemy.crits).toBe(2);
    expect(enemy.norms).toBe(0);
    expect(duelist.hasDuelistParried).toBe(false);
  });
  it('only normals vs a Brutal enemy does not spend a die or the once-per-fight flag', () => {
    // Brutal can only be parried by a crit, so normals-only has no legal parry.
    const duelist = newFighterState(0, 2, 99, FightStrategy.MaxDmgToEnemy, new Set<Ability>([Ability.Duelist]));
    const enemy = newFighterState(0, 2, 99, FightStrategy.Strike, new Set<Ability>([Ability.Brutal]));

    handleDuelist(duelist, enemy);

    expect(duelist.norms).toBe(2);
    expect(enemy.norms).toBe(2);
    expect(duelist.hasDuelistParried).toBe(false);
  });
});

describe(resolveDieChoice.name + ': basic, shock, storm shield, hammerhand, dueller', () => {
  const origChooserCrits = 10;
  const origChooserNorms = 20;
  const origEnemyCrits = 30;
  const origEnemyNorms = 40;
  const finalWounds = 100;

  function makeChooser(...abilities: Ability[]): FighterState {
    return newFighterState(
      origChooserCrits,
      origChooserNorms,
      finalWounds,
      FightStrategy.MaxDmgToEnemy,
      new Set<Ability>(abilities));
  }
  function makeEnemy(wounds: number = finalWounds): FighterState {
    return newFighterState(
      origEnemyCrits,
      origEnemyNorms,
      wounds,
    );
  }

  it('CritStrike+noShock, and check even values that shouldn\'t change', () => {
    for(let stormShieldMaybe of [Ability.None, Ability.StormShield2021]) { // storm shield shouldn't matter
      const chooser = makeChooser(stormShieldMaybe);
      const enemy = makeEnemy(chooser.profile.critDmg + finalWounds);

      resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
      expect(chooser.crits).toBe(origChooserCrits - 1);
      expect(chooser.norms).toBe(origChooserNorms);
      expect(chooser.currentWounds).toBe(finalWounds);
      expect(enemy.crits).toBe(origEnemyCrits);
      expect(enemy.norms).toBe(origEnemyNorms);
      expect(enemy.currentWounds).toBe(finalWounds);
    }
  });
  it('CritStrike+shock, not already shocked', () => {
    for(let stormShield of [false, true]) { // storm shield shouldn't matter
      const chooser = makeChooser(Ability.Shock, stormShield ? Ability.StormShield2021 : Ability.None);
      chooser.profile.setAbility(Ability.Shock, true);
      const enemy = makeEnemy(chooser.profile.critDmg + finalWounds);

      resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
      expect(chooser.crits).toBe(origChooserCrits - 1);
      expect(chooser.norms).toBe(origChooserNorms);
      expect(chooser.currentWounds).toBe(finalWounds);
      expect(enemy.crits).toBe(origEnemyCrits);
      expect(enemy.norms).toBe(origEnemyNorms - 1);
      expect(enemy.currentWounds).toBe(finalWounds);
    }
  });
  it('CritStrike+shock, enemy has no normals, so a crit is discarded', () => {
    const chooser = makeChooser(Ability.Shock);
    chooser.profile.setAbility(Ability.Shock, true);
    const enemy = newFighterState(origEnemyCrits, 0, chooser.profile.critDmg + finalWounds);

    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits - 1);
    expect(enemy.norms).toBe(0);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritStrike+shock, enemy has no successes, discards nothing', () => {
    const chooser = makeChooser(Ability.Shock);
    chooser.profile.setAbility(Ability.Shock, true);
    const enemy = newFighterState(0, 0, chooser.profile.critDmg + finalWounds);

    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
    expect(enemy.crits).toBe(0);
    expect(enemy.norms).toBe(0);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritStrike+shock, already shocked', () => {
    for(let stormShieldMaybe of [Ability.None, Ability.StormShield2021]) { // storm shield shouldn't matter
      const chooser = makeChooser(Ability.Shock, stormShieldMaybe);
      chooser.hasCritStruck = true;
      const enemy = makeEnemy(chooser.profile.critDmg + finalWounds);

      resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
      expect(chooser.crits).toBe(origChooserCrits - 1);
      expect(chooser.norms).toBe(origChooserNorms);
      expect(chooser.currentWounds).toBe(finalWounds);
      expect(enemy.crits).toBe(origEnemyCrits);
      expect(enemy.norms).toBe(origEnemyNorms);
      expect(enemy.currentWounds).toBe(finalWounds);
    }
  });
  it('NormStrike', () => {
    for(let shockAndStormShield of [false, true]) { // neither should matter
      const chooser = makeChooser();
      chooser.profile.setAbility(Ability.StormShield2021, shockAndStormShield);
      chooser.profile.setAbility(Ability.Shock, shockAndStormShield);
      const enemy = makeEnemy(chooser.profile.normDmg + finalWounds);

      resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
      expect(chooser.crits).toBe(origChooserCrits);
      expect(chooser.norms).toBe(origChooserNorms - 1);
      expect(chooser.currentWounds).toBe(finalWounds);
      expect(enemy.crits).toBe(origEnemyCrits);
      expect(enemy.norms).toBe(origEnemyNorms);
      expect(enemy.currentWounds).toBe(finalWounds);
    }
  });
  it('CritParry to cancel enemy crit', () => {
    const chooser = makeChooser();
    const enemy = makeEnemy();

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits - 1);
    expect(enemy.norms).toBe(origEnemyNorms);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritParry to cancel enemy norm (no enemy crits)', () => {
    const chooser = makeChooser();
    const enemy = newFighterState(0, origEnemyNorms, finalWounds);

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(0);
    expect(enemy.norms).toBe(origEnemyNorms - 1);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('NormParry to cancel enemy norm', () => {
    const chooser = makeChooser();
    const enemy = makeEnemy();

    resolveDieChoice(FightChoice.NormParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits);
    expect(chooser.norms).toBe(origChooserNorms - 1);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits);
    expect(enemy.norms).toBe(origEnemyNorms - 1);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritParry with storm shield to cancel 2 enemy crits', () => {
    const chooser = makeChooser(Ability.StormShield2021);
    const enemy = makeEnemy();

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits - 2);
    expect(enemy.norms).toBe(origEnemyNorms);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritParry with StormShield or Dueller to cancel 1 enemy crit & 1 enemy norm', () => {
    const chooser = makeChooser(Ability.StormShield2021);
    const enemy = newFighterState(1, origEnemyNorms, finalWounds);

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(0);
    expect(enemy.norms).toBe(origEnemyNorms - 1);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritParry with storm shield to cancel 2 enemy norms', () => {
    const chooser = makeChooser(Ability.StormShield2021);
    const enemy = newFighterState(0, origEnemyNorms, finalWounds);

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(0);
    expect(enemy.norms).toBe(origEnemyNorms - 2);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('NormParry with storm shield to cancel 2 enemy norms', () => {
    const chooser = makeChooser(Ability.StormShield2021);
    const enemy = makeEnemy();

    resolveDieChoice(FightChoice.NormParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits);
    expect(chooser.norms).toBe(origChooserNorms - 1);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits);
    expect(enemy.norms).toBe(origEnemyNorms - 2);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritParry with Dueller to cancel 1 enemy crit and 1 enemy norm', () => {
    const chooser = makeChooser(Ability.Dueller);
    const enemy = makeEnemy();

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits - 1);
    expect(enemy.norms).toBe(origEnemyNorms - 1);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('CritParry with Dueller to cancel 2 enemy norms (because no enemy crits)', () => {
    const chooser = makeChooser(Ability.Dueller);
    const enemy = newFighterState(0, origEnemyNorms, finalWounds);

    resolveDieChoice(FightChoice.CritParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits - 1);
    expect(chooser.norms).toBe(origChooserNorms);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(0);
    expect(enemy.norms).toBe(origEnemyNorms - 2);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('NormParry with Dueller to cancel 1 enemy norm', () => {
    const chooser = makeChooser(Ability.Dueller);
    const enemy = makeEnemy();

    resolveDieChoice(FightChoice.NormParry, chooser, enemy);
    expect(chooser.crits).toBe(origChooserCrits);
    expect(chooser.norms).toBe(origChooserNorms - 1);
    expect(chooser.currentWounds).toBe(finalWounds);
    expect(enemy.crits).toBe(origEnemyCrits);
    expect(enemy.norms).toBe(origEnemyNorms - 1);
    expect(enemy.currentWounds).toBe(finalWounds);
  });
  it('hammerhand 1st hit deals extra damage and 2nd hit does not', () => {
    const initialWounds = 100;
    const chooser = makeChooser(Ability.Hammerhand2021);
    const enemy = makeEnemy(initialWounds);

    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - chooser.profile.normDmg - 1);
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 2 * chooser.profile.normDmg - 1);
  });
  it('HalfDamageFirstStrike halves first norm strike damage (rounded up, min 2)', () => {
    const initialWounds = 100;
    const normDmg = 5;
    const chooser = newFighterState(2, 2, 10);
    chooser.profile.setProp('normDmg', normDmg);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    // First strike: 5 dmg halved = ceil(5/2) = 3
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 3);

    // Second strike: full damage
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 3 - normDmg);
  });
  it('HalfDamageFirstStrike halves first crit strike damage (rounded up, min 2)', () => {
    const initialWounds = 100;
    const critDmg = 7;
    const chooser = newFighterState(2, 2, 10);
    chooser.profile.setProp('critDmg', critDmg);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    // First crit strike: 7 dmg halved = ceil(7/2) = 4
    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 4);
  });
  it('HalfDamageFirstStrike enforces minimum of 2 damage', () => {
    const initialWounds = 100;
    const chooser = newFighterState(2, 2, 10);
    chooser.profile.setProp('normDmg', 2); // ceil(2/2) = 1, but min is 2
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 2);
  });
  it('HalfDamageFirstStrike leaves a 1-damage strike at 1', () => {
    const initialWounds = 100;
    const chooser = newFighterState(2, 2, 10);
    chooser.profile.setProp('normDmg', 1); // ceil(1/2) = 1; the floor must not lift it to 2
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 1);
  });
  it('HalfDamageFirstStrike leaves a 0-damage strike at 0', () => {
    const initialWounds = 100;
    const chooser = newFighterState(2, 2, 10);
    chooser.profile.setProp('normDmg', 0);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds);
  });
  it('HalfDamageFirstStrike with hammerhand: hammerhand applies then halved', () => {
    const initialWounds = 100;
    const normDmg = 3;
    const chooser = makeChooser(Ability.Hammerhand2021);
    chooser.profile.setProp('normDmg', normDmg);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    // Hammerhand: 3+1=4, then halved: ceil(4/2)=2
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - 2);
  });
  it('JustAScratch takes priority over HalfDamageFirstStrike', () => {
    const initialWounds = 100;
    const chooser = newFighterState(2, 2, 10);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.JustAScratch, true);
    enemy.profile.setAbility(Ability.HalfDamageFirstStrike, true);

    // JustAScratch sets damage to 0, overriding half damage
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds);
  });
  it('JustAScratchNorms ignores a normal strike but not a crit strike', () => {
    const initialWounds = 100;
    const critDmg = 5;
    const chooser = newFighterState(2, 2, 10);
    chooser.profile.setProp('critDmg', critDmg);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.JustAScratchNorms, true);

    // crit strike is unaffected by JaS (Normals)
    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - critDmg);

    // first norm strike is ignored (scratch spent)
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - critDmg);

    // second norm strike does full damage (scratch already spent)
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - critDmg - chooser.profile.normDmg);
  });
  it('JustAScratchNorms ignores the first normal strike when it is first', () => {
    const initialWounds = 100;
    const chooser = newFighterState(0, 2, 10);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.JustAScratchNorms, true);

    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds);
  });
  it('JustAScratch and JustAScratchNorms together ignore two hits', () => {
    const initialWounds = 100;
    const chooser = newFighterState(0, 3, 10);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.JustAScratch, true);
    enemy.profile.setAbility(Ability.JustAScratchNorms, true);

    // first norm strike zeroed by JaS (Crits), second zeroed by JaS (Normals)
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds);

    // third norm strike does full damage
    resolveDieChoice(FightChoice.NormStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - chooser.profile.normDmg);
  });
  it('possibleDmg(0,0) is 0 even with Hammerhand and remaining dice (no falsy-0 fallback)', () => {
    // regression: hammerhandDmg used `crits || this.crits`, so possibleDmg(0,0)
    // returned 1 for a Hammerhand fighter, inflating the parry kill-lookahead
    const chooser = newFighterState(2, 2, 10, FightStrategy.MaxDmgToEnemy,
      new Set([Ability.Hammerhand2021]));
    expect(chooser.possibleDmg(0, 0)).toBe(0);
    // sanity: with a real strike remaining, Hammerhand's +1 still counts
    expect(chooser.possibleDmg(0, 1)).toBe(chooser.profile.normDmg + 1);
  });
  it('JustAScratchNorms ignores a Murderous Entrance bonus normal hit', () => {
    const initialWounds = 100;
    const critDmg = 5;
    const chooser = newFighterState(1, 1, 10, FightStrategy.MaxDmgToEnemy,
      new Set([Ability.MurderousEntrance2021]));
    chooser.profile.setProp('critDmg', critDmg);
    const enemy = newFighterState(2, 2, initialWounds);
    enemy.profile.setAbility(Ability.JustAScratchNorms, true);

    // crit strike lands full; the bonus normal hit from Murderous Entrance is the
    // first normal hit, so JaS (Normals) ignores it
    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);
    expect(enemy.currentWounds).toBe(initialWounds - critDmg);
  });
  it('Murderous Entrance skips the bonus strike once the target is dead, so it cannot spend a relic', () => {
    // crit 2, pending normal 4: the crit is not the biggest strike, so Saintly Relics is saved
    // for the bonus normal. The crit already kills. The bonus must not resolve, and must not
    // roll (and spend) that saved ignore.
    const critDmg = 2;
    const chooser = newFighterState(1, 1, 10, FightStrategy.MaxDmgToEnemy,
      new Set([Ability.MurderousEntrance2021]));
    chooser.profile.setProp('critDmg', critDmg);
    chooser.profile.setProp('normDmg', 4);
    const enemy = newFighterState(0, 0, critDmg);
    enemy.profile.setProp('saintlyRelics', SaintlyRelicsNormal);
    enemy.rng = () => 0.9; // floor(0.9*6)+1 === 6, so a rolled relic always ignores

    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);

    expect(enemy.currentWounds).toBe(0);
    expect(enemy.relicUsed).toBe(false);
    expect(enemy.relicIgnoresUsed).toBe(0);
    expect(chooser.crits).toBe(0);
    expect(chooser.norms).toBe(1);
    expect(chooser.hasCritStruck).toBe(true);
  });
  it('Murderous Entrance still lands the bonus strike when the target survives the crit', () => {
    const critDmg = 2;
    const initialWounds = 10;
    const chooser = newFighterState(1, 1, 10, FightStrategy.MaxDmgToEnemy,
      new Set([Ability.MurderousEntrance2021]));
    chooser.profile.setProp('critDmg', critDmg);
    chooser.profile.setProp('normDmg', 4);
    const enemy = newFighterState(0, 0, initialWounds);
    enemy.profile.setProp('saintlyRelics', SaintlyRelicsNormal);
    enemy.rng = () => 0.9;

    resolveDieChoice(FightChoice.CritStrike, chooser, enemy);

    // crit lands (relic saved for the bigger normal); the bonus normal is ignored by the relic
    expect(enemy.currentWounds).toBe(initialWounds - critDmg);
    expect(enemy.relicUsed).toBe(true);
    expect(enemy.relicIgnoresUsed).toBe(1);
    expect(chooser.crits).toBe(0);
    expect(chooser.norms).toBe(0);
  });
});

describe(resolveFight.name + ' smart strategies should optimize goal', () => {
  it('"smart" strategies should not be outperformed by other strats', () => {
    const maxSuccesses = 3;
    const maxWounds = 4;
    let maxDmgBeatStrikeAtLeastOnce = false;
    let minDmgBeatParryAtLeastOnce = false;

    for(let wounds1 of range(maxWounds)) {
      for(let crits1 of range(maxSuccesses)) {
        for(let norms1 of range(maxSuccesses - crits1)) {
          for(let wounds2 of range(maxWounds)) {
            for(let crits2 of range(maxSuccesses)) {
              for(let norms2 of range(maxSuccesses - crits2)) {
                for(let shock of [false, true]) {
                    for(let stormShield of [false, true]) {
                    const abilities = new Set<Ability>();
                    Util.addOrRemove(abilities, Ability.Shock, shock);
                    Util.addOrRemove(abilities, Ability.StormShield2021, stormShield);
                    const chooserAlwaysStrike = newFighterState(crits1, norms1, wounds1, FightStrategy.Strike, abilities);
                    const chooserAlwaysParry = newFighterState(crits1, norms1, wounds1, FightStrategy.Parry, abilities);
                    const chooserMaxDmg = newFighterState(crits1, norms1, wounds1, FightStrategy.MaxDmgToEnemy, abilities);
                    const chooserMinDmg = newFighterState(crits1, norms1, wounds1, FightStrategy.MinDmgToSelf, abilities);
                    const enemyForAlwaysStrike = newFighterState(crits2, norms2, wounds2, FightStrategy.Strike);
                    const enemyForAlwaysParry = clone(enemyForAlwaysStrike);
                    const enemyForMaxDmg = clone(enemyForAlwaysStrike);
                    const enemyForMinDmg = clone(enemyForAlwaysStrike);

                    resolveFight(chooserAlwaysStrike, enemyForAlwaysStrike);
                    resolveFight(chooserAlwaysParry, enemyForAlwaysParry);
                    resolveFight(chooserMaxDmg, enemyForMaxDmg);
                    resolveFight(chooserMinDmg, enemyForMinDmg);

                    expect(chooserAlwaysStrike.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(chooserAlwaysParry.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(chooserMaxDmg.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(chooserMinDmg.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(enemyForAlwaysStrike.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(enemyForAlwaysParry.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(enemyForMaxDmg.currentWounds).toBeGreaterThanOrEqual(0);
                    expect(enemyForMinDmg.currentWounds).toBeGreaterThanOrEqual(0);

                    expect(enemyForMaxDmg.currentWounds).toBeLessThanOrEqual(enemyForAlwaysStrike.currentWounds);
                    expect(enemyForMaxDmg.currentWounds).toBeLessThanOrEqual(enemyForAlwaysParry.currentWounds);
                    expect(enemyForMaxDmg.currentWounds).toBeLessThanOrEqual(enemyForMinDmg.currentWounds);

                    expect(chooserMinDmg.currentWounds).toBeGreaterThanOrEqual(chooserAlwaysStrike.currentWounds);
                    expect(chooserMinDmg.currentWounds).toBeGreaterThanOrEqual(chooserAlwaysParry.currentWounds);
                    expect(chooserMinDmg.currentWounds).toBeGreaterThanOrEqual(chooserMaxDmg.currentWounds);

                    if(enemyForMaxDmg.currentWounds < enemyForAlwaysStrike.currentWounds) {
                      maxDmgBeatStrikeAtLeastOnce = true;
                    }

                    if(chooserMinDmg.currentWounds > chooserAlwaysParry.currentWounds) {
                      minDmgBeatParryAtLeastOnce = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    //expect(maxDmgBeatStrikeAtLeastOnce).toBe(true);
    //expect(minDmgBeatParryAtLeastOnce).toBe(true);
  });
});

describe(resolveFight.name + 'hardcoded answers', () => {
  it('guy1 kill guy2 in 1 crit strike', () => {
    const guy1 = newFighterState(1, 1, 1);
    const guy2 = newFighterState(1, 1, 2);

    resolveFight(guy1, guy2);
    expect(guy1.currentWounds).toBe(guy1.profile.wounds);
    expect(guy2.currentWounds).toBe(0);
  });
  it('guy1 parry once then kill guy2', () => {
    const guy1 = newFighterState(2, 1, 1);
    const guy2 = newFighterState(0, 1, 4);

    resolveFight(guy1, guy2);
    expect(guy1.currentWounds).toBe(guy1.profile.wounds);
    expect(guy2.currentWounds).toBe(0);
  });
  it('guy1 vs guy2 many strikes', () => {
    const guy1 = newFighterState(2, 1, 5, FightStrategy.Strike);
    const guy2 = newFighterState(2, 1, 5, FightStrategy.Strike);

    resolveFight(guy1, guy2);
    expect(guy1.currentWounds).toBe(1);
    expect(guy2.currentWounds).toBe(0);
  });
  it('Parry fighter with Shock discards a crit-only enemy crit and deals the strike', () => {
    // newFighterState uses critDmg=2. A plain crit parry would cancel the enemy crit and deal
    // nothing; the shocking crit strike deals 2 and discards that crit, so they never strike back.
    const atk = newFighterState(1, 0, 10, FightStrategy.Parry, new Set<Ability>([Ability.Shock]));
    const def = newFighterState(1, 0, 10, FightStrategy.Strike);

    resolveFight(atk, def);
    expect(atk.currentWounds).toBe(10);
    expect(def.currentWounds).toBe(10 - atk.profile.critDmg);
    expect(def.crits).toBe(0);
    expect(atk.crits).toBe(0);
  });
});

describe(calcRemainingWounds.name + ' basic', () => {
  const pc = 1 / 6;
  const pf = 1 - pc;
  const w = 5;
  const dn = 3;
  const dc = 4;

  it('fight can\'t be cut short', () => {
    const guy1 = new Model(1, 6, dn, dc).setProp('wounds', w);
    const guy2 = clone(guy1);

    const woundPairProbs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const [guy1Wounds, guy2Wounds] = consolidateWoundPairProbs(woundPairProbs);
    expect(guy1Wounds.get(w)).toBeCloseTo(pf, requiredPrecision);
    expect(guy1Wounds.get(w - dc)).toBeCloseTo(pc, requiredPrecision);
    expect(guy2Wounds.get(w)).toBeCloseTo(pf, requiredPrecision);
    expect(guy2Wounds.get(w - dc)).toBeCloseTo(pc, requiredPrecision);
  });
  it('fight can be cut short', () => {
    const guy1 = new Model(1, 6, dn, dc).setProp('wounds', dc);
    const guy2 = clone(guy1);

    const woundPairProbs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const [guy1Wounds, guy2Wounds] = consolidateWoundPairProbs(woundPairProbs);
    expect(guy1Wounds.get(0)).toBeCloseTo(pf * pc, requiredPrecision);
    expect(guy1Wounds.get(dc)).toBeCloseTo(pc + pf * pf, requiredPrecision);
    expect(guy2Wounds.get(0)).toBeCloseTo(pc, requiredPrecision);
    expect(guy2Wounds.get(dc)).toBeCloseTo(pf, requiredPrecision);
  });
  it('Lethal does not promote dice that would otherwise fail (WS=6+ Lethal=4+ → only nat 6 crits)', () => {
    // WS=6+ means only a 6 hits at all; Lethal=4+ should NOT make 4s/5s into crits
    // guy2 is the attacker; guy1 is a passive sandbag (no attacks)
    const guy1 = new Model(0, 7, 1, 1).setProp('wounds', 100);
    const guy2 = new Model(1, 6, 1, 2).setProp('wounds', 100).setProp('lethal', 4);

    const probs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const [guy1Wounds] = consolidateWoundPairProbs(probs);
    // guy2 hits guy1 only on nat 6 (1/6); damage = critDmg = 2
    const pHit = 1 / 6;
    const dmgProb = guy1Wounds.get(100 - 2) ?? 0;
    expect(dmgProb).toBeCloseTo(pHit, requiredPrecision);
  });
});

describe(calcRemainingWounds.name + ' multiple rounds', () => {
  const pc = 1 / 6;
  const pf = 1 - pc;
  const w = 5;
  const dn = 3;
  const dc = 4;

  it('double fight where fight1 can\'t be fatal', () => {
    const guy1 = new Model(1, 6, dn, dc).setProp('wounds', w);
    const guy2 = clone(guy1);

    const woundPairProbs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 2, highSimCount, 12345);
    const [guy1Wounds, guy2Wounds] = consolidateWoundPairProbs(woundPairProbs);
    const h0 = w; // hits taken = 0
    const h1 = w - dc; // hits taken = 1
    const h2 = 0; // hits taken = 2
    const f4c0 = Math.pow(pf, 4);
    const f3c1 = Math.pow(pf, 3) * pc;
    const f2c2 = pf * pf * pc * pc;
    const f1c3 = pf * Math.pow(pc, 3);
    const f0c4 = Math.pow(pc, 4);

    expect(guy1Wounds.get(h0)).toBeCloseTo(f4c0 + f3c1 * 2 + f2c2     + f1c3           , requiredPrecision);
    expect(guy1Wounds.get(h1)).toBeCloseTo(       f3c1 * 2 + f2c2 * 4 + f1c3     + f0c4, requiredPrecision);
    expect(guy1Wounds.get(h2)).toBeCloseTo(                  f2c2     + f1c3 * 2       , requiredPrecision);
    expect(guy2Wounds.get(h0)).toBeCloseTo(f4c0 + f3c1 * 2 + f2c2                      , requiredPrecision);
    expect(guy2Wounds.get(h1)).toBeCloseTo(       f3c1 * 2 + f2c2 * 4 + f1c3 * 2       , requiredPrecision);
    expect(guy2Wounds.get(h2)).toBeCloseTo(                  f2c2     + f1c3 * 2 + f0c4, requiredPrecision);
  });
  it('double fight with possibly fatal fight1', () => {
    const guy1 = new Model(1, 6, dn, dc).setProp('wounds', dc);
    const guy2 = clone(guy1);

    const woundPairProbs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 2, highSimCount, 12345);
    expect(woundPairProbs.get(toWoundPairKey(dc, dc))).toBeCloseTo(Math.pow(pf, 4), requiredPrecision);
    expect(woundPairProbs.get(toWoundPairKey(0, dc))).toBeCloseTo(Math.pow(pf, 3) * pc + pf * pc, requiredPrecision);
    expect(woundPairProbs.get(toWoundPairKey(dc, 0))).toBeCloseTo(pf * pf * pc + pc, requiredPrecision);
  });
});

describe('Injured in multi-round fights', () => {
  it('worsens the Hit stat by 1 below half starting wounds, never past 6+', () => {
    expect(injuredHitStat(4, 5, 10)).toBe(4); // exactly half is not injured
    expect(injuredHitStat(4, 4, 10)).toBe(5);
    expect(injuredHitStat(3, 5, 11)).toBe(4); // 5 < 5.5
    expect(injuredHitStat(5, 1, 10)).toBe(6);
    expect(injuredHitStat(6, 1, 10)).toBe(6);
    expect(injuredHitStat(7, 1, 10)).toBe(7); // never-hit sentinel stays put
  });

  // guy1 (WS 4+, 1 attack for 1) is hit for 6 every round by guy2 (1 auto-crit for 6, 100 wounds).
  const makeGuys = (guy1Wounds: number) => {
    const guy1 = new Model(1, 4, 1, 1).setProp('wounds', guy1Wounds);
    const guy2 = new Model(1, 4, 6, 6).setProp('wounds', 100).setProp('autoCrits', 1);
    return [guy1, guy2];
  };

  it('a fighter injured in round 1 hits on 5+ in round 2', () => {
    const [guy1, guy2] = makeGuys(10); // 10 - 6 = 4 left, below half
    const probs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 2, highSimCount, 12345);
    const [, guy2Wounds] = consolidateWoundPairProbs(probs);
    expect(guy2Wounds.get(100)).toBeCloseTo(1/2 * 2/3, requiredPrecision);
    expect(guy2Wounds.get(99)).toBeCloseTo(1/2 * 1/3 + 1/2 * 2/3, requiredPrecision);
    expect(guy2Wounds.get(98)).toBeCloseTo(1/2 * 1/3, requiredPrecision);
    // The engine restores the caller's models
    expect(guy1.diceStat).toBe(4);
    expect(guy1.wounds).toBe(10);
  });

  it('a fighter left on exactly half wounds is not injured', () => {
    const [guy1, guy2] = makeGuys(12); // 12 - 6 = 6 left, exactly half
    const probs = calcRemainingWoundPairProbs(guy1, guy2, FightStrategy.Strike, FightStrategy.Strike, 2, highSimCount, 12345);
    const [, guy2Wounds] = consolidateWoundPairProbs(probs);
    expect(guy2Wounds.get(100)).toBeCloseTo(1/4, requiredPrecision);
    expect(guy2Wounds.get(98)).toBeCloseTo(1/4, requiredPrecision);
  });
});

describe('Feel No Pain in fights', () => {
  it('FNP reduces damage taken on average', () => {
    const wounds = 12;
    const guy1 = new Model(4, 3, 3, 4).setProp('wounds', wounds);
    const guy2NoFnp = new Model(4, 3, 3, 4).setProp('wounds', wounds);
    const guy2Fnp = new Model(4, 3, 3, 4).setProp('wounds', wounds).setProp('fnp', 5);

    const probsNoFnp = calcRemainingWoundPairProbs(guy1, guy2NoFnp, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const probsFnp = calcRemainingWoundPairProbs(guy1, guy2Fnp, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const [guy1WoundsNoFnp] = consolidateWoundPairProbs(probsNoFnp);
    const [guy1WoundsFnp] = consolidateWoundPairProbs(probsFnp);

    // Guy1 should take less damage when guy2 has FNP (guy2 survives longer and hits back more)
    // Actually, FNP is on the defender (guy2), so guy1's wounds should be similar
    // but guy2 should survive with more wounds on average
    const [, guy2WoundsNoFnp] = consolidateWoundPairProbs(probsNoFnp);
    const [, guy2WoundsFnp] = consolidateWoundPairProbs(probsFnp);

    let avgWoundsNoFnp = 0;
    let avgWoundsFnp = 0;
    for (const [w, p] of guy2WoundsNoFnp) avgWoundsNoFnp += w * p;
    for (const [w, p] of guy2WoundsFnp) avgWoundsFnp += w * p;

    // FNP defender should have more remaining wounds on average
    expect(avgWoundsFnp).toBeGreaterThan(avgWoundsNoFnp);
  });

  it('FNP 4+ is stronger than FNP 6+', () => {
    const wounds = 12;
    const guy1a = new Model(4, 3, 3, 4).setProp('wounds', wounds);
    const guy1b = clone(guy1a);
    const guy2Fnp4 = new Model(4, 3, 3, 4).setProp('wounds', wounds).setProp('fnp', 4);
    const guy2Fnp6 = new Model(4, 3, 3, 4).setProp('wounds', wounds).setProp('fnp', 6);

    const probsFnp4 = calcRemainingWoundPairProbs(guy1a, guy2Fnp4, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const probsFnp6 = calcRemainingWoundPairProbs(guy1b, guy2Fnp6, FightStrategy.Strike, FightStrategy.Strike, 1, highSimCount, 12345);
    const [, guy2WoundsFnp4] = consolidateWoundPairProbs(probsFnp4);
    const [, guy2WoundsFnp6] = consolidateWoundPairProbs(probsFnp6);

    let avgFnp4 = 0;
    let avgFnp6 = 0;
    for (const [w, p] of guy2WoundsFnp4) avgFnp4 += w * p;
    for (const [w, p] of guy2WoundsFnp6) avgFnp6 += w * p;

    // FNP 4+ should leave more wounds remaining than FNP 6+
    expect(avgFnp4).toBeGreaterThan(avgFnp6);
  });

  it('FNP applies per point of damage from each strike', () => {
    const rng = testRng();
    // Set up a simple scenario: 1 crit strike doing 4 damage, defender has FNP 4+
    const attacker = newFighterState(1, 0, 10, FightStrategy.Strike);
    const defender = newFighterState(0, 0, 10, FightStrategy.Strike);
    defender.profile.setProp('fnp', 4);
    defender.rng = rng;

    // Do a crit strike (deals 2 damage based on newFighterState defaults)
    resolveDieChoice(FightChoice.CritStrike, attacker, defender);

    // With FNP, defender should take <= 2 damage (some may be saved)
    // We can't predict exact value due to rng, but wounds should be <= 10 and >= 8
    expect(defender.currentWounds).toBeGreaterThanOrEqual(8);
    expect(defender.currentWounds).toBeLessThanOrEqual(10);
  });
});

describe('crit-damage monotonicity (Common Random Numbers)', () => {
  // regression: with a single shared cross-simulation RNG stream, raising a fighter's
  // OWN crit damage reshuffled the whole Monte Carlo sample and could make that
  // fighter's own death chance drift UPWARD (pure sampling noise). Per-simulation,
  // per-purpose CRN streams make the comparison reflect only the real effect, which
  // is monotone: dealing more damage never increases your own risk here.
  function bDeathChance(bCritDmg: number): number {
    // FighterA: 21W, 5 attacks WS4+ Lethal5+, 4/critDmg5, Rending, Max-damage
    const a = new Model(5, 4, 4, 5).setProp('wounds', 21).setProp('lethal', 5)
      .setAbility(Ability.Rending);
    // FighterB: 14W, 5 attacks WS3+, 5/bCritDmg, FNP4+, Severe, Min-damage-to-self
    const b = new Model(5, 3, 5, bCritDmg).setProp('wounds', 14).setProp('fnp', 4)
      .setAbility(Ability.Severe);
    const probs = calcRemainingWoundPairProbs(a, b,
      FightStrategy.MaxDmgToEnemy, FightStrategy.MinDmgToSelf, 1, highSimCount, 12345);
    const [, bWounds] = consolidateWoundPairProbs(probs);
    return bWounds.get(0) || 0;
  }

  it('raising B\'s own crit damage does not raise B\'s own death chance', () => {
    const cd5 = bDeathChance(5);
    const cd7 = bDeathChance(7);
    const cd8 = bDeathChance(8);
    expect(cd7).toBeLessThanOrEqual(cd5 + 1e-4);
    expect(cd8).toBeLessThanOrEqual(cd7 + 1e-4);
  });
});

describe('Parry, when forced to strike, uses the same strike order as Max Dmg', () => {
  // strategyStrike used to send Parry straight to nextStrike() (crit-first). Just a Scratch
  // and half-damage then eat the crit. Parry is forced to strike when the enemy is out of
  // dice, including after Parry has just parried the enemy's last success.
  function parryFighter(crits: number, norms: number, critDmg: number, normDmg: number): FighterState {
    const chooser = newFighterState(crits, norms, 99, FightStrategy.Parry);
    chooser.profile.critDmg = critDmg;
    chooser.profile.normDmg = normDmg;
    return chooser;
  }

  it('defender out of dice with Just a Scratch: strike the normal first and kill', () => {
    // 1 crit (5) + 1 normal (2) vs 5 wounds and no dice. Crit-first is scratched and the
    // normal leaves the defender at 3. Norm-first is scratched and the crit kills.
    const chooser = parryFighter(1, 1, 5, 2);
    const enemy = newFighterState(0, 0, 5, FightStrategy.Strike, new Set<Ability>([Ability.JustAScratch]));

    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.NormStrike);
    resolveFight(chooser, enemy);
    expect(enemy.currentWounds).toBe(0);
  });

  it('after parrying the last die, Just a Scratch eats a normal and the rest kill', () => {
    // 1 crit (4) + 3 normals (3) vs 1 normal and 7 wounds. Parry cancels that normal, then
    // crit-first scratches the crit and the two normals leave 1 wound (7 - 3 - 3).
    // Norm-first scratches a normal and 4+3+3 kills.
    const chooser = parryFighter(1, 3, 4, 3);
    const enemy = newFighterState(0, 1, 7, FightStrategy.Strike, new Set<Ability>([Ability.JustAScratch]));

    resolveFight(chooser, enemy);
    expect(enemy.currentWounds).toBe(0);
  });

  it('after parrying the last die, half-damage falls on a normal and the crit kills', () => {
    // 1 crit (5) + 2 normals (2) vs 1 normal and 6 wounds with half-damage on the first
    // strike. After the parry, crit-first deals ceil(5/2)+2 = 5 and leaves 1 wound.
    // Norm-first deals 2 (already at the half-damage floor) + 5 = 7 and kills.
    const chooser = parryFighter(1, 2, 5, 2);
    const enemy = newFighterState(
      0, 1, 6, FightStrategy.Strike, new Set<Ability>([Ability.HalfDamageFirstStrike]));

    resolveFight(chooser, enemy);
    expect(enemy.currentWounds).toBe(0);
  });

  it('stays crit-first on a tie when both orders kill', () => {
    // Positive control. Just a Scratch is on, but the defender has only 2 wounds, so either
    // order kills (the un-scratched die is at least 2). The comparison ties and crit-first stays.
    const chooser = parryFighter(1, 1, 5, 2);
    const enemy = newFighterState(0, 0, 2, FightStrategy.Strike, new Set<Ability>([Ability.JustAScratch]));

    expect(calcDieChoice(chooser, enemy)).toBe(FightChoice.CritStrike);
  });
});

describe('JustAScratch + parry monotonicity', () => {
  // regression: previously, more rerolls for JAS-defender increased death chance
  // because awesomeParry fired when enemy had 0 successes (chooser wasted crits parrying nothing)
  // and didn't account for JAS reducing chooser's first post-parry strike to 0
  function aDeathChance(rerollA: Ability | undefined, strat: FightStrategy): number {
    const A = new Model(4, 4, 3, 4).setProp('wounds', 8).setAbility(Ability.JustAScratch);
    if (rerollA) A.reroll = rerollA;
    const B = new Model(4, 4, 3, 4).setProp('wounds', 8);
    const probs = calcRemainingWoundPairProbs(B, A,
      FightStrategy.MaxDmgToEnemy, strat, 1, highSimCount, 12345);
    const [, aWounds] = consolidateWoundPairProbs(probs);
    return aWounds.get(0) || 0;
  }

  it('Parry: more rerolls → less death', () => {
    const none = aDeathChance(undefined, FightStrategy.Parry);
    const bal = aDeathChance(Ability.Balanced, FightStrategy.Parry);
    const dbal = aDeathChance(Ability.DoubleBalanced, FightStrategy.Parry);
    expect(bal).toBeLessThanOrEqual(none);
    expect(dbal).toBeLessThanOrEqual(bal);
  });

  it('MinDmgToSelf: more rerolls → less death', () => {
    const none = aDeathChance(undefined, FightStrategy.MinDmgToSelf);
    const bal = aDeathChance(Ability.Balanced, FightStrategy.MinDmgToSelf);
    const dbal = aDeathChance(Ability.DoubleBalanced, FightStrategy.MinDmgToSelf);
    expect(bal).toBeLessThanOrEqual(none);
    expect(dbal).toBeLessThanOrEqual(bal);
  });
});

describe('SaintlyRelics (fight)', () => {
  // measure the relic-holder's expected surviving wounds against a hard-hitting attacker
  function defenderAvgWounds(relicMode: number): number {
    const defender = new Model(4, 3, 3, 4).setProp('wounds', 12).setProp('saintlyRelics', relicMode);
    const attacker = new Model(5, 3, 3, 4).setProp('wounds', 12);
    const probs = calcRemainingWoundPairProbs(defender, attacker,
      FightStrategy.MaxDmgToEnemy, FightStrategy.MaxDmgToEnemy, 1, highSimCount, 12345);
    const [defWounds] = consolidateWoundPairProbs(probs);
    return Util.weightedAverage(defWounds);
  }

  it('more relic dice → more surviving wounds (none < normal < inspiring)', () => {
    const none = defenderAvgWounds(SaintlyRelicsOff);
    const normal = defenderAvgWounds(SaintlyRelicsNormal);
    const inspiring = defenderAvgWounds(SaintlyRelicsInspiring);
    expect(normal).toBeGreaterThan(none);
    expect(inspiring).toBeGreaterThan(normal);
  });
  it('applyDmg saves the ignore for a bigger pending strike, then caps at one per action', () => {
    const profile = new Model(2, 2, 1, 4).setProp('wounds', 12).setProp('saintlyRelics', SaintlyRelicsNormal);
    const always6 = () => 0.9; // Math.floor(0.9*6)+1 === 6, so the relic always ignores when rolled
    const state = new FighterState(profile, 0, 0, FightStrategy.MaxDmgToEnemy, 10, false, false, always6);

    state.applyDmg(3, false); // not the biggest strike => save the relic; full damage lands
    expect(state.currentWounds).toBe(7);
    expect(state.relicUsed).toBe(false);

    state.applyDmg(3, true); // biggest strike => spend the ignore
    expect(state.currentWounds).toBe(7);
    expect(state.relicUsed).toBe(true);

    state.applyDmg(3, true); // per-action cap already spent => no further ignore
    expect(state.currentWounds).toBe(4);
  });
  it('caps ignores at two per battle across rounds (reset clears the action flag, not the battle count)', () => {
    const profile = new Model(2, 2, 1, 4).setProp('wounds', 30).setProp('saintlyRelics', SaintlyRelicsNormal);
    const always6 = () => 0.9;
    const state = new FighterState(profile, 0, 0, FightStrategy.MaxDmgToEnemy, 30, false, false, always6);

    state.applyDmg(3, true); // battle ignore #1
    expect(state.relicIgnoresUsed).toBe(1);
    expect(state.currentWounds).toBe(30);

    state.reset(0, 0, 30); // new action/round
    state.applyDmg(3, true); // battle ignore #2
    expect(state.relicIgnoresUsed).toBe(2);
    expect(state.currentWounds).toBe(30);

    state.reset(0, 0, 30); // new action/round, but battle cap is spent
    state.applyDmg(3, true); // no ignore => damage lands
    expect(state.relicIgnoresUsed).toBe(2);
    expect(state.currentWounds).toBe(27);
  });
});

describe(resolveFight.name + ' negative-success guard', () => {
  it('throws when fighter 2 ends with negative normals', () => {
    // Fighter 1 is already at 0 wounds, so the strike/parry loop never runs and the
    // incoming dice counts reach the end-of-fight guard unchanged. Fighter 1 still
    // holds successes so the loop condition is the wounds check, not an empty dice pool.
    const guy1 = newFighterState(1, 1, 0);
    const guy2 = newFighterState(0, -1, 3);

    expect(() => resolveFight(guy1, guy2)).toThrow('bug: ended up with negative successes');
  });
});
