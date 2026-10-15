import Ability, {currentAbility} from './Ability';
import Model from './Model';
import FighterState from './FighterState';
import FightChoice from './FightChoice';
import FightStrategy from './FightStrategy';
import {calcRemainingWoundPairProbs, resolveFight, resolveDieChoice} from './CalcEngineFightInternal';
import {legalFightMoves, modernFightDecision, resolveModernMove, resolveSingleFightDie, resolveDevastating} from './ModernFight';
import {applyPostRollModifications} from './CalcEngineCommon';
import {simulateFighterDice} from './MonteCarloFightDice';

function fighter(crits: number, norms: number, rules: Ability[] = [], strategy = FightStrategy.MaxDmgToEnemy, wounds = 20) {
  return new FighterState(new Model(crits + norms, 3, 3, 5, 0, new Set(rules)).setProp('wounds', wounds), crits, norms, strategy);
}
const choices = [FightChoice.CritStrike, FightChoice.NormStrike, FightChoice.CritParry, FightChoice.NormParry];

describe('2024 fight rules', () => {
  it('migrates equivalent generic effects and rejects removed 2021 mechanics', () => {
    expect(currentAbility('MurderousEntrance2021')).toBe(Ability.CriticalStrike);
    expect(currentAbility('Hammerhand2021')).toBe(Ability.FirstStrikeBonus);
    expect(currentAbility('Duelist2021')).toBe(Ability.PreParry);
    for (const name of ['Dueller2021', 'StormShield2021', 'Waaagh2021', 'CloseAssault'])
      expect(currentAbility(name)).toBeUndefined();
  });
  it('Dueller blocks one crit with a normal but respects Brutal', () => {
    const a = fighter(0, 2, [Ability.Dueller]), b = fighter(2, 0);
    resolveDieChoice(FightChoice.NormParry, a, b);
    expect([a.norms, b.crits]).toEqual([1, 1]);
    b.profile.setAbility(Ability.Brutal);
    expect(legalFightMoves(a, b).some(m => m.choice === FightChoice.NormParry)).toBe(false);
  });
  it('one enhanced normal block can cancel a crit, then is spent', () => {
    const a = fighter(0, 2, [Ability.DoubleBlock]), b = fighter(2, 0);
    resolveDieChoice(FightChoice.NormParry, a, b);
    expect(a.doubleBlockUsed).toBe(true);
    expect(b.crits).toBe(1);
    expect(legalFightMoves(a, b).some(m => m.choice === FightChoice.NormParry)).toBe(false);
  });
  it('one enhanced critical block cancels two crits and does not recur', () => {
    const a = fighter(2, 0, [Ability.DoubleBlock], FightStrategy.MinDmgToSelf), b = fighter(4, 0);
    resolveDieChoice(FightChoice.CritParry, a, b);
    expect(b.crits).toBe(2);
    resolveDieChoice(FightChoice.CritParry, a, b);
    expect(b.crits).toBe(1);
  });
  it('Strike On Death can kill the attacker, consumes a die, and grants no follow-up', () => {
    const a = fighter(1, 0, [], FightStrategy.Strike, 4);
    const b = fighter(2, 0, [Ability.StrikeOnDeath, Ability.StrikeStrike], FightStrategy.MinDmgToSelf, 3);
    resolveFight(a, b);
    expect([a.currentWounds, b.currentWounds, b.crits]).toEqual([0, 0, 1]);
    expect(b.deathStrikeUsed).toBe(true);
  });
  it('Strike On Death requires an unresolved success', () => {
    const a = fighter(1, 0), b = fighter(0, 0, [Ability.StrikeOnDeath], FightStrategy.Strike, 3);
    resolveFight(a, b);
    expect(a.currentWounds).toBe(20);
  });
  it('Min damage blocks a lethal death strike instead of blindly taking a kill', () => {
    const a = fighter(2, 0, [], FightStrategy.MinDmgToSelf, 4);
    const b = fighter(1, 0, [Ability.StrikeOnDeath], FightStrategy.Strike, 3);
    expect(modernFightDecision(a, b).move!.choice).toBe(FightChoice.CritParry);
    resolveFight(a, b);
    expect([a.currentWounds, b.currentWounds]).toEqual([4, 0]);
  });
  it('Cegorach converts a normal strike into a block, even against Brutal, once', () => {
    const a = fighter(0, 2, [], FightStrategy.Strike), b = fighter(0, 2, [Ability.CegorachsJest, Ability.Brutal], FightStrategy.MinDmgToSelf);
    b.rng = () => 0;
    resolveDieChoice(FightChoice.NormStrike, a, b);
    expect([b.currentWounds, b.norms, b.jestUsed]).toEqual([20, 1, true]);
    resolveDieChoice(FightChoice.NormStrike, a, b);
    expect(b.currentWounds).toBe(17);
  });
  it('failed Cegorach rolls do not spend the rule; crits do not trigger it', () => {
    const a = fighter(1, 2, [], FightStrategy.Strike), b = fighter(0, 0, [Ability.CegorachsJest]);
    b.rng = jest.fn(() => 0.99);
    resolveDieChoice(FightChoice.CritStrike, a, b);
    expect(b.rng).not.toHaveBeenCalled();
    resolveDieChoice(FightChoice.NormStrike, a, b);
    expect(b.jestUsed).toBe(false);
    expect(b.currentWounds).toBe(12);
  });
  it.each([FightChoice.CritStrike, FightChoice.NormStrike])('first strike bonus applies once to die %s, after a block', choice => {
    const a = fighter(2, 2, [Ability.FirstStrikeBonus]), b = fighter(0, 2);
    resolveDieChoice(FightChoice.NormParry, a, b);
    resolveDieChoice(choice, a, b);
    expect(b.currentWounds).toBe(choice === FightChoice.CritStrike ? 14 : 16);
    resolveDieChoice(FightChoice.CritStrike, a, b);
    expect(b.currentWounds).toBe(choice === FightChoice.CritStrike ? 9 : 11);
  });
  it('saves the optional crit bonus past a cancelled first strike', () => {
    const a = fighter(2, 0, [Ability.CritDamageBonus], FightStrategy.Strike);
    const b = fighter(0, 0, [Ability.JustAScratch]);
    resolveDieChoice(FightChoice.CritStrike, a, b);
    expect(a.critBonusUsed).toBe(false);
    resolveDieChoice(FightChoice.CritStrike, a, b);
    expect([b.currentWounds, a.critBonusUsed]).toEqual([14, true]);
  });
  it('Devastating damages before strikes, leaves the crits, and cannot be blocked', () => {
    const a = fighter(2, 0), b = fighter(2, 0);
    a.profile.mwx = 2;
    resolveDevastating(a, b);
    expect([b.currentWounds, a.crits]).toEqual([16, 2]);
    resolveDevastating(a, b);
    expect(b.currentWounds).toBe(16);
    resolveDieChoice(FightChoice.CritParry, b, a);
    expect([b.currentWounds, a.crits]).toEqual([16, 1]);
  });
  it('Devastating can end the fight before the first strike', () => {
    const a = fighter(1, 0), b = fighter(1, 0, [], FightStrategy.Strike, 2);
    a.profile.mwx = 2;
    resolveFight(a, b);
    expect([a.currentWounds, b.currentWounds, a.hasStruck]).toEqual([20, 0, false]);
  });
  it('previews consume no RNG and do not mutate live flags', () => {
    const a = fighter(2, 2, [Ability.StealthAssault, Ability.DoubleBlock]);
    const b = fighter(2, 2, [Ability.CegorachsJest]);
    a.rng = jest.fn(() => 0.1); b.rng = jest.fn(() => 0.2);
    modernFightDecision(a, b);
    expect(a.rng).not.toHaveBeenCalled(); expect(b.rng).not.toHaveBeenCalled();
    expect([a.successes(), b.successes(), a.hasResolvedDie, a.doubleBlockUsed, b.jestUsed]).toEqual([4, 4, false, false, false]);
  });
  it('resets all per-fight resources and preserves them in clones', () => {
    const a = fighter(1, 1);
    a.hasResolvedDie = a.doubleBlockUsed = a.critBonusUsed = a.jestUsed = a.deathStrikeUsed = a.devastatingResolved = true;
    const copy = a.clone();
    expect([copy.hasResolvedDie, copy.doubleBlockUsed, copy.critBonusUsed, copy.jestUsed, copy.deathStrikeUsed, copy.devastatingResolved]).toEqual(Array(6).fill(true));
    copy.reset(1, 1, 20);
    expect([copy.hasResolvedDie, copy.doubleBlockUsed, copy.critBonusUsed, copy.jestUsed, copy.deathStrikeUsed, copy.devastatingResolved]).toEqual(Array(6).fill(false));
  });
});

describe('Stealth Assault', () => {
  it.each(choices.flatMap(first => choices.map(second => [first, second])))('permits consecutive dice %s then %s', (first, second) => {
    const a = fighter(2, 2, [Ability.StealthAssault]), b = fighter(3, 3);
    const firstMove = legalFightMoves(a, b).find(m => m.choice === first)!;
    expect(resolveSingleFightDie(a, b, firstMove, 'turn')).toBe('any');
    const next = legalFightMoves(a, b, 'any').find(m => m.choice === second)!;
    expect(next).toBeDefined();
    expect(resolveSingleFightDie(a, b, next, 'any')).toBeNull();
    expect(a.successes()).toBe(2);
    expect(a.currentWounds).toBe(20);
  });
  it('Min damage chooses block + block to survive two otherwise lethal hits', () => {
    const a = fighter(0, 2, [Ability.StealthAssault], FightStrategy.MinDmgToSelf, 2);
    const b = fighter(0, 2, [], FightStrategy.Strike);
    resolveModernMove(a, b, modernFightDecision(a, b).move!);
    expect([a.currentWounds, a.successes(), b.successes()]).toEqual([2, 0, 0]);
  });
  it('Max damage chooses crit + crit for an immediate kill before retaliation', () => {
    const a = fighter(2, 0, [Ability.StealthAssault], FightStrategy.MaxDmgToEnemy, 2);
    const b = fighter(2, 0, [], FightStrategy.Strike, 10);
    resolveFight(a, b);
    expect([a.currentWounds, b.currentWounds]).toEqual([2, 0]);
  });
  it('Min damage chooses strike + block when it can deal damage without taking a hit', () => {
    const a = fighter(1, 1, [Ability.StealthAssault], FightStrategy.MinDmgToSelf, 2);
    const b = fighter(0, 1, [], FightStrategy.Strike, 20);
    const first = modernFightDecision(a, b).move!;
    expect(first.choice).toBe(FightChoice.CritStrike);
    resolveModernMove(a, b, first);
    expect([a.currentWounds, b.currentWounds, a.successes(), b.successes()]).toEqual([2, 15, 0, 0]);
  });
  it('Min damage chooses block + strike when killing first would trigger a lethal death strike', () => {
    const a = fighter(1, 1, [Ability.StealthAssault], FightStrategy.MinDmgToSelf, 4);
    const b = fighter(1, 0, [Ability.StrikeOnDeath], FightStrategy.Strike, 3);
    const first = modernFightDecision(a, b).move!;
    expect(first.choice).toBe(FightChoice.CritParry);
    resolveModernMove(a, b, first);
    expect([a.currentWounds, b.currentWounds, a.successes(), b.successes()]).toEqual([4, 0, 0, 0]);
  });
  it('stops after a lethal first die, and only has one follow-up window', () => {
    const a = fighter(2, 0, [Ability.StealthAssault]), b = fighter(1, 0, [], FightStrategy.Strike, 4);
    resolveFight(a, b);
    expect(a.crits).toBe(1);
    const c = fighter(0, 4, [Ability.StealthAssault], FightStrategy.Strike), d = fighter(0, 0);
    resolveDieChoice(FightChoice.NormStrike, c, d);
    expect(c.norms).toBe(2);
    resolveDieChoice(FightChoice.NormStrike, c, d);
    expect(c.norms).toBe(1);
  });
});

describe('2024 roll effects', () => {
  const bless = (c: number, n: number, f: number, auto = 0, shield = false) => applyPostRollModifications(c, n, f, 0, auto, 0, 0, new Set([Ability.BlessingsOfInfection]), 3, 5, undefined, shield);
  it('requires three fails, spends two, and does not promote the retained normal again', () => {
    expect(bless(0, 0, 2)).toEqual({crits: 0, norms: 0});
    expect(bless(0, 0, 3)).toEqual({crits: 0, norms: 1});
    expect(applyPostRollModifications(1, 0, 3, 0, 0, 0, 0,
      new Set([Ability.BlessingsOfInfection, Ability.Rending]), 3, 5)).toEqual({crits: 1, norms: 1});
  });
  it('requires three rolled successes plus a fail to upgrade a rolled normal', () => {
    expect(bless(0, 3, 1)).toEqual({crits: 1, norms: 2});
    expect(bless(0, 2, 1)).toEqual({crits: 0, norms: 2});
    expect(bless(0, 3, 0)).toEqual({crits: 0, norms: 3});
    expect(bless(0, 2, 1, 1)).toEqual({crits: 0, norms: 3});
    expect(bless(0, 3, 1, 0, true)).toEqual({crits: 0, norms: 3});
  });
  it('Tilting Shields suppresses Lethal, Rending, Severe and generic critical promotions', () => {
    const model = new Model(4, 3, 3, 5).setProp('lethal', 5).setProp('normsToCrits', 2);
    model.setAbility(Ability.Rending).setAbility(Ability.Severe);
    const enemy = new Model().setAbility(Ability.TiltingShields);
    let rolls = [5, 4, 3, 6];
    expect(simulateFighterDice(model, enemy, () => (rolls.shift()! - 0.5) / 6)).toEqual({crits: 1, norms: 3, cursed: 0});
    expect(model.lethal).toBe(5);
    expect(model.normsToCrits).toBe(2);
  });
  it('Tilting Shields leaves the legal Mystic fail retention available', () => {
    const model = new Model(2, 3, 3, 5).setAbility(Ability.MysticScryBuff);
    const enemy = new Model().setAbility(Ability.TiltingShields);
    const rolls = [3, 1];
    expect(simulateFighterDice(model, enemy, () => (rolls.shift()! - 0.5) / 6)).toEqual({crits: 0, norms: 2, cursed: 0});
  });
  it('Tilting Shields prevents Severe when no six was rolled', () => {
    const model = new Model(2, 3, 3, 5).setAbility(Ability.Severe);
    const enemy = new Model().setAbility(Ability.TiltingShields);
    expect(simulateFighterDice(model, enemy, () => 0.6)).toEqual({crits: 0, norms: 2, cursed: 0});
  });
  it('the full calculator remains deterministic with combined new rules and both tactics', () => {
    const a = new Model(4, 3, 3, 5).setAbility(Ability.StealthAssault).setAbility(Ability.BlessingsOfInfection);
    const b = new Model(4, 3, 3, 5).setAbility(Ability.Dueller).setAbility(Ability.CegorachsJest).setAbility(Ability.StrikeOnDeath);
    const run = () => calcRemainingWoundPairProbs(a, b, FightStrategy.MinDmgToSelf, FightStrategy.MaxDmgToEnemy, 1, 120, 123);
    const result = run();
    expect(run()).toEqual(result);
    expect([...result.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(1);
  });
});
