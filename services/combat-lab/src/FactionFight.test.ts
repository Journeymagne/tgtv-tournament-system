import Ability from './Ability';
import {calcRemainingWoundPairProbs, fromWoundPairKey, resolveDieChoice} from './CalcEngineFightInternal';
import FighterState from './FighterState';
import FightChoice from './FightChoice';
import FightStrategy from './FightStrategy';
import Model from './Model';
import {legalFightMoves} from './ModernFight';
import {simulateFighterDice} from './MonteCarloFightDice';

const strike = FightStrategy.Strike;
const target = () => new Model(0).setProp('wounds', 30);
const state = (model: Model, crits = 0, norms = 0) => new FighterState(model, crits, norms, strike);
const woundsAfter = (a: Model, b: Model, rounds = 1, samples = 64, firstInitiates = true) =>
  [...calcRemainingWoundPairProbs(a, b, strike, strike, rounds, samples, 1234, firstInitiates)]
    .map(([key, probability]) => ({wounds: fromWoundPairKey(key)[1], probability}));

it('keeps Survival Instincts on the retaliating operative even when it resolves first', () => {
  const a = state(new Model().setAbility(Ability.SurvivalInstincts), 2);
  const b = state(new Model(), 4);
  a.isInitiator = true;
  expect(legalFightMoves(a, b).some(move => move.enhanced)).toBe(false);
  a.isInitiator = false;
  a.profile.setAbility(Ability.DoubleBlock);
  resolveDieChoice(FightChoice.CritParry, a, b);
  expect(b.crits).toBe(2);
  expect(legalFightMoves(a, b).some(move => move.enhanced)).toBe(false);
});

it('allows Vicious Venom only for the initiating fighter and treats the D3 as part of its strike', () => {
  const a = new Model(1, 1, 3, 5).withAlwaysCrit().setAbility(Ability.ViciousVenom);
  const b = target().setAbility(Ability.UndauntedExplorers);
  expect(woundsAfter(a, b, 1, 2000).map(outcome => outcome.wounds).sort()).toEqual([26, 27]);
  expect(woundsAfter(a, b, 1, 32, false)).toEqual([{wounds: 27, probability: 1}]);
});

it('preserves the original duel when a role-only rule is ineligible', () => {
  const a = new Model(), b = new Model();
  const baseline = calcRemainingWoundPairProbs(a, b, undefined, undefined, 2, 256, 1234);
  a.setAbility(Ability.SurvivalInstincts);
  b.setAbility(Ability.ViciousVenom);
  expect(calcRemainingWoundPairProbs(a, b, undefined, undefined, 2, 256, 1234)).toEqual(baseline);
});

it('halves only the first damaging die across three fights and never doubles the reduction', () => {
  const a = new Model(1, 1, 5, 5).withAlwaysNorm();
  const b = target().setAbility(Ability.UndauntedExplorers);
  expect(woundsAfter(a, b, 3)).toEqual([{wounds: 17, probability: 1}]);
  b.setAbility(Ability.HalfDamageFirstStrike);
  expect(woundsAfter(a, b, 1)).toEqual([{wounds: 27, probability: 1}]);
  b.setAbility(Ability.JustAScratch);
  b.fightOnceAbilities = [Ability.JustAScratch];
  b.setAbility(Ability.HalfDamageFirstStrike, false);
  expect(woundsAfter(a, b, 3)).toEqual([{wounds: 22, probability: 1}]);
});

it('retries Oubliex after a failed 5+ and stops rolling once it ignores a die', () => {
  const a = state(new Model(3, 3, 4, 4), 0, 3);
  const b = state(target().setAbility(Ability.Oubliex));
  b.rng = jest.fn().mockReturnValueOnce(0.50).mockReturnValueOnce(0.75);
  resolveDieChoice(FightChoice.NormStrike, a, b);
  expect(b.currentWounds).toBe(26);
  resolveDieChoice(FightChoice.NormStrike, a, b);
  expect(b.currentWounds).toBe(26);
  resolveDieChoice(FightChoice.NormStrike, a, b);
  expect(b.currentWounds).toBe(22);
  expect(b.rng).toHaveBeenCalledTimes(2);
});

it('carries a successful Oubliex ignore across all fights in the turning point', () => {
  const a = new Model(1, 1, 6, 6).withAlwaysNorm();
  const b = target().setAbility(Ability.Oubliex);
  const outcomes = woundsAfter(a, b, 3, 2500);
  expect(outcomes.map(row => row.wounds).sort()).toEqual([12, 18]);
  const allFailed = outcomes.find(row => row.wounds === 12)!.probability;
  expect(Math.abs(allFailed - (2 / 3) ** 3)).toBeLessThan(0.03);
});

it.each([[9, 21 / 31], [10, 1 / 2]])('Crush rolls off against printed Wounds %i', (printedWounds, winChance) => {
  const a = new Model(1, 1, 1, 1).withAlwaysNorm().setAbility(Ability.Crush);
  const b = target().setProp('wounds', 8).setProp('woundsStat', printedWounds);
  const outcomes = woundsAfter(a, b, 1, 5000, false);
  expect(outcomes.map(row => row.wounds).sort()).toEqual([4, 5, 6, 7]);
  const wins = outcomes.filter(row => row.wounds < 7).reduce((sum, row) => sum + row.probability, 0);
  expect(Math.abs(wins - winChance)).toBeLessThan(0.03);
});

it('spends Faith across fights and cannot use Guidance on an already rerolled die', () => {
  const model = new Model(1, 7, 3, 5).setAbility(Ability.ActsOfFaith);
  expect(woundsAfter(model, target(), 3)).toEqual([{wounds: 27, probability: 1}]);
  expect(model.faithPoints).toBe(3);
  model.faithPoints = 1; model.diceStat = 3; model.reroll = Ability.Balanced;
  const rng = jest.fn().mockReturnValueOnce(0).mockReturnValueOnce(0);
  expect(simulateFighterDice(model, undefined, rng)).toMatchObject({crits: 0, norms: 0, faithSpent: 0});
  expect(rng).toHaveBeenCalledTimes(2);
});

it('uses Icon only for two distinct Acts during a roll', () => {
  const a = new Model(2, 3, 3, 5).setAbility(Ability.ActsOfFaith).setAbility(Ability.IconOfFaith);
  a.faithPoints = 5;
  const rng = jest.fn().mockReturnValueOnce(0.55).mockReturnValueOnce(0);
  const dice = simulateFighterDice(a, undefined, rng);
  expect(dice).toMatchObject({crits: 1, norms: 1, faithSpent: 5});
  expect(dice.usedFightAbilities).toContain(Ability.IconOfFaith);
});
