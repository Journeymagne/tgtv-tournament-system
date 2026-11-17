import Ability from 'src/Ability';
import Model from 'src/Model';
import FightStrategy from 'src/FightStrategy';
import { calcRemainingWoundPairProbs, toWoundPairKey } from 'src/CalcEngineFightInternal';
import { applyPostRollModifications } from 'src/CalcEngineCommon';
import { simulateFighterDice } from 'src/MonteCarloFightDice';
import * as FightDice from 'src/MonteCarloFightDice';
import { hydrate, pack } from 'src/simulation/model';
import { passiveFightAbilities } from 'src/FightEffectFrequency';
import FighterState from 'src/FighterState';
import FightChoice from 'src/FightChoice';
import { resolveDieChoice } from 'src/CalcEngineFightInternal';
import { resolveDeathStrike } from 'src/ModernFight';

function fight(a: Model, b: Model, rounds = 3) {
  return calcRemainingWoundPairProbs(a, b, FightStrategy.Strike, FightStrategy.Strike, rounds, 8);
}
const fighter = (dice = 1) => new Model(dice, 1, 3, 3).setProp('lethal', 7).setProp('wounds', 30);

it('expires passive effects after the first fight even when no trigger fired', () => {
  const a = fighter(0), b = fighter(0);
  passiveFightAbilities.forEach(ability => a.setAbility(ability));
  a.fightOnceAbilities = [...passiveFightAbilities];
  const seen: Ability[][] = [];
  const realRoll = FightDice.simulateFighterDice;
  const mock = jest.spyOn(FightDice, 'simulateFighterDice').mockImplementation((model, defender, rng) => {
    if (seen.length < 3 && model.fightOnceAbilities.length) seen.push([...model.abilities]);
    return realRoll(model, defender, rng);
  });
  try {
    calcRemainingWoundPairProbs(a, b, FightStrategy.Strike, FightStrategy.Strike, 3, 1);
    expect(seen).toEqual([[...passiveFightAbilities], [], []]);
  } finally {mock.mockRestore();}
});

it.each([
  [Ability.Rending, 1, 1, 0, 2, 0],
  [Ability.Severe, 0, 1, 0, 1, 0],
  [Ability.Punishing, 1, 0, 1, 1, 1],
  [Ability.MysticScryBuff, 0, 0, 1, 0, 1],
  [Ability.BlessingsOfInfection, 0, 0, 3, 0, 1],
])('records actual %s conversion on the chosen dice outcome', (ability, crits, norms, fails, expectedCrits, expectedNorms) => {
  const result = applyPostRollModifications(crits, norms, fails, 0, 0, 0, 0,
    new Set([ability as Ability]), 3, 4, undefined, false, true);
  expect(result).toEqual({crits: expectedCrits, norms: expectedNorms, usedFightAbilities: [ability]});
});

it.each([
  [Ability.FirstStrikeBonus, 0, 1, FightChoice.NormStrike],
  [Ability.CritDamageBonus, 1, 0, FightChoice.CritStrike],
  [Ability.Shock, 1, 0, FightChoice.CritStrike],
  [Ability.StrikeStrike, 0, 2, FightChoice.NormStrike],
  [Ability.CriticalStrike, 2, 0, FightChoice.CritStrike],
  [Ability.StealthAssault, 0, 2, FightChoice.NormStrike],
  [Ability.DoubleBlock, 1, 0, FightChoice.CritParry],
])('records live combat use of %s and keeps lookahead uses separate', (ability, crits, norms, choice) => {
  const a = new FighterState(fighter().setAbility(ability as Ability), crits as number, norms as number, FightStrategy.Strike);
  const b = new FighterState(fighter(), 0, 3, FightStrategy.Strike);
  resolveDieChoice(choice as FightChoice, a.asEstimate(), b.asEstimate());
  expect(a.usedFightAbilities).toEqual([]);
  resolveDieChoice(choice as FightChoice, a, b);
  expect(a.usedFightAbilities).toContain(ability);
});

it('records a successful Jest conversion and a strike on death', () => {
  const attacker = new FighterState(fighter().setProp('diceStat', 3), 0, 1, FightStrategy.Strike);
  const defender = new FighterState(fighter().setAbility(Ability.CegorachsJest), 0, 0, FightStrategy.MinDmgToSelf,
    30, false, false, () => 0);
  resolveDieChoice(FightChoice.NormStrike, attacker, defender);
  expect(defender.currentWounds).toBe(30);
  expect(defender.usedFightAbilities).toContain(Ability.CegorachsJest);
  const dead = new FighterState(fighter().setAbility(Ability.StrikeOnDeath), 0, 1, FightStrategy.Strike, 0);
  resolveDeathStrike(dead, defender);
  expect(dead.usedFightAbilities).toContain(Ability.StrikeOnDeath);
});

it.each([Ability.FirstStrikeBonus, Ability.CritDamageBonus])('limits %s damage bonuses across three fights', ability => {
  const a = fighter().setAbility(ability);
  if (ability === Ability.CritDamageBonus) a.lethal = 1;
  const b = fighter(0);
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 18), 1]]));
  a.fightOnceAbilities = [ability];
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 20), 1]]));
});

it('limits damage halving across fights in either resolver', () => {
  for (const modern of [false, true]) {
    const a = fighter().setProp('mwx', modern ? 1 : 0);
    const b = fighter(0).setAbility(Ability.HalfDamageFirstStrike);
    expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 24), 1]]));
    b.fightOnceAbilities = [Ability.HalfDamageFirstStrike];
    expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 22), 1]]));
  }
});

it('limits Shock discard across fights in either resolver', () => {
  for (const modern of [false, true]) {
    const a = fighter().setProp('lethal', 1).setAbility(Ability.Shock).setProp('mwx', modern ? 1 : 0);
    const b = fighter();
    expect([...fight(a, b).keys()].map(key => Math.floor(Number(key) / 1000))).toEqual([30]);
    a.fightOnceAbilities = [Ability.Shock];
    expect([...fight(a, b).keys()].map(key => Math.floor(Number(key) / 1000))).toEqual([24]);
  }
});

it.each([Ability.JustAScratch, Ability.JustAScratchNorms])('%s is spent independently across fights in either resolver', ability => {
  for (const modern of [false, true]) {
    const a = fighter().setProp('mwx', modern ? 1 : 0);
    const b = fighter(0).setAbility(ability);
    expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 30), 1]]));
    b.fightOnceAbilities = [ability];
    expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 24), 1]]));
    // A separate calculation must receive a fresh allowance; inputs stay intact.
    expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 24), 1]]));
    expect(b.has(ability)).toBe(true);
    expect(b.wounds).toBe(30);
    expect(fight(a, b, 1)).toEqual(new Map([[toWoundPairKey(30, 30), 1]]));
  }
});

it('tracks each fighter separately and preserves unlimited effects beside a limited one', () => {
  const a = fighter().setAbility(Ability.JustAScratch);
  const b = fighter().setAbility(Ability.JustAScratch);
  a.fightOnceAbilities = [Ability.JustAScratch];
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(24, 30), 1]]));
  b.fightOnceAbilities = [Ability.JustAScratch];
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(24, 24), 1]]));
});

it('spends PreParry once across fights instead of blocking again in every fight', () => {
  const a = fighter().setAbility(Ability.PreParry);
  const b = fighter();
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 30), 1]]));
  a.fightOnceAbilities = [Ability.PreParry];
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(24, 24), 1]]));
});

it('spends Purity Seal only once and transports the setting through the worker', () => {
  const a = new Model(2, 7, 3, 3).setProp('wounds', 30).setAbility(Ability.PuritySeal);
  const b = fighter(0);
  expect(fight(a, b)).toEqual(new Map([[toWoundPairKey(30, 21), 1]]));
  a.fightOnceAbilities = [Ability.PuritySeal];
  expect(fight(hydrate(pack(a)), b)).toEqual(new Map([[toWoundPairKey(30, 27), 1]]));
});

it('does not spend Purity Seal on a roll that cannot use it', () => {
  const a = fighter(2).setAbility(Ability.PuritySeal);
  a.fightOnceAbilities = [Ability.PuritySeal];
  expect(simulateFighterDice(a, undefined, () => 0.5).usedFightAbilities).not.toContain(Ability.PuritySeal);
  a.diceStat = 7;
  expect(simulateFighterDice(a, undefined, () => 0.5).usedFightAbilities).toContain(Ability.PuritySeal);
});

it('carries unused Purity Seal through the first fight, then spends it in the second', () => {
  const a = new Model(2, 3, 3, 3).setProp('wounds', 30).setAbility(Ability.PuritySeal);
  a.fightOnceAbilities = [Ability.PuritySeal];
  const realRoll = FightDice.simulateFighterDice;
  let call = 0;
  const rolls = [0.5, 0.5, 0, 0.5, 0, 0.5];
  const mock = jest.spyOn(FightDice, 'simulateFighterDice').mockImplementation((model, defender) => {
    const roll = rolls[call++];
    return realRoll(model, defender, () => roll);
  });
  try {
    expect(calcRemainingWoundPairProbs(a, fighter(0), FightStrategy.Strike, FightStrategy.Strike, 3, 1))
      .toEqual(new Map([[toWoundPairKey(30, 21), 1]]));
  } finally { mock.mockRestore(); }
});

it('keeps normal-only Scratch after a critical-only fight and spends it on the next normal hit', () => {
  const b = fighter(0).setAbility(Ability.JustAScratchNorms);
  b.fightOnceAbilities = [Ability.JustAScratchNorms];
  const realRoll = FightDice.simulateFighterDice;
  let call = 0;
  const mock = jest.spyOn(FightDice, 'simulateFighterDice').mockImplementation((model, defender) =>
    realRoll(call++ === 0 ? model.withProp('lethal', 1) : model, defender, () => 0.5));
  try {
    expect(calcRemainingWoundPairProbs(fighter(), b, FightStrategy.Strike, FightStrategy.Strike, 3, 1))
      .toEqual(new Map([[toWoundPairKey(30, 24), 1]]));
  } finally { mock.mockRestore(); }
});

it('records the chosen Purity Seal conversion after optional Punishing consumes a fail', () => {
  const abilities = new Set([Ability.PuritySeal, Ability.Punishing]);
  const result = applyPostRollModifications(1, 0, 2, 0, 0, 0, 0, abilities, 3, 3, undefined, false, true);
  expect(result).toEqual({crits: 1, norms: 1, usedFightAbilities: [Ability.Punishing]});
});

it('keeps distinct Purity Seal usage on optional Blessings dice outcomes', () => {
  const a = new Model(3, 7, 3, 3).setAbility(Ability.PuritySeal).setAbility(Ability.BlessingsOfInfection);
  a.fightOnceAbilities = [Ability.PuritySeal];
  const options = simulateFighterDice(a, undefined, () => 0.5).options!;
  expect(options).toEqual(expect.arrayContaining([
    expect.objectContaining({crits: 0, norms: 1, usedFightAbilities: [Ability.PuritySeal]}),
    expect.objectContaining({crits: 0, norms: 1, usedFightAbilities: [Ability.BlessingsOfInfection]}),
  ]));
});
