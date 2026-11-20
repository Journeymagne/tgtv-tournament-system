import Ability from 'src/Ability';
import {calcDmgProbs} from 'src/CalcEngineShoot';
import {chooseFactionRoll} from 'src/FactionDice';
import Model from 'src/Model';
import ShootOptions from 'src/ShootOptions';

const undefended = () => new Model(0);
const hits = (crits: number, norms: number) => new Model(crits + norms, 1, 3, 7)
  .setProp('lethal', 7).setProp('autoCrits', crits);
function expectDamage(a: Model, d: Model, expected: [number, number][], rounds = 1) {
  const result = calcDmgProbs(a, d, new ShootOptions(rounds));
  for (const [damage, probability] of expected)
    expect(result.get(damage) ?? 0).toBeCloseTo(probability, 10);
  expect([...result.values()].reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 10);
}

it('Survival Instincts spends one save for one enhanced block, including a normal save against a crit', () => {
  const d = new Model(1).setProp('autoNorms', 1).setAbility(Ability.SurvivalInstincts);
  expectDamage(hits(2, 0), d, [[7, 1]]);
  d.autoCrits = 1;
  expectDamage(hits(2, 1), d, [[3, 1]]);
});

it('Domino Field blocks all matching numbers, and a cover save has no number', () => {
  const a = new Model(2, 1, 3, 3).setProp('lethal', 7);
  const d = new Model(1, 1).setProp('hardyx', 7).setAbility(Ability.DominoField);
  // The one ordinary save already blocks a hit; both hits match that save on 1/36.
  expectDamage(a, d, [[0, 1 / 36], [3, 35 / 36]]);
  d.autoNorms = 1;
  expectDamage(a, d, [[3, 1]]);
});

it('preserves the roll printed on a Rending die, and gives Accurate no face', () => {
  const model = new Model().setAbility(Ability.Rending);
  const chosen = chooseFactionRoll({model, autoCrits: 0, autoNorms: 1, keepFaces: true},
    {fresh: [4, 6], rerolled: [], cursed: 0, prob: 1}, r => r.crits.length);
  expect(chosen[0].dice.crits).toEqual([4, 6]);
  expect(chosen[0].dice.norms).toEqual([0]);
});

it('Bulwark improves Save and collects four defence dice before Piercing', () => {
  const d = Model.basicDefender(4).setAbility(Ability.OmnissiahsImperative);
  expectDamage(hits(0, 1).setProp('apx', 3), d, [[0, 2 / 3], [3, 1 / 3]]);
});

it('Sturdy downgrades all retained crits after Devastating and Piercing Crits', () => {
  const a = hits(1, 0).setProp('mwx', 2).setProp('px', 1).setAbility(Ability.CriticalShot);
  const d = new Model(1).setProp('autoNorms', 1).setAbility(Ability.Sturdy);
  expectDamage(a, d, [[5, 1]]);
  a.px = 0;
  expectDamage(a, d, [[2, 1]]);
});

it('Undaunted Explorers halves the selected unblocked die, rounding up with a minimum of two', () => {
  const d = undefended().setAbility(Ability.UndauntedExplorers);
  expectDamage(hits(1, 1), d, [[7, 1]]);
  expectDamage(hits(1, 1), d, [[17, 1]], 2);
  expectDamage(hits(0, 1).setProp('normDmg', 1), d, [[1, 1]]);
});

it('Critical Shot adds one D3 to one unblocked crit, including when later halved', () => {
  const a = hits(2, 0).setAbility(Ability.CriticalShot);
  expectDamage(a, undefended(), [[15, 1 / 3], [16, 1 / 3], [17, 1 / 3]]);
  expectDamage(a, new Model(2).setProp('autoCrits', 2), [[0, 1]]);
  expectDamage(a, undefended().setAbility(Ability.UndauntedExplorers), [[11, 1 / 3], [12, 2 / 3]]);
});

it('Oubliex retries after a miss and carries the successful ignore across two shots', () => {
  const d = undefended().setAbility(Ability.Oubliex);
  expectDamage(hits(0, 1), d, [[0, 1 / 3], [3, 2 / 3]]);
  expectDamage(hits(0, 1), d, [[3, 5 / 9], [6, 4 / 9]], 2);
  expectDamage(hits(1, 0).setProp('mwx', 2), d, [[2, 1 / 3], [9, 2 / 3]]);
  expectDamage(hits(1, 0).setProp('mwx', 2), d.withProp('numDice', 1).setProp('autoCrits', 1), [[2, 1]]);
});

it('keeps one-use normal Scratch when a normal hit was already blocked by a save', () => {
  const d = new Model(1, 4).setAbility(Ability.JustAScratchNorms);
  d.shootOnceAbilities = [Ability.JustAScratchNorms];
  expectDamage(hits(0, 1), d, [[0, 3 / 4], [3, 1 / 4]], 2);
});

it('limits Critical Shot across actions to the first resolved crit', () => {
  const a = hits(1, 0).setAbility(Ability.CriticalShot);
  a.shootOnceAbilities = [Ability.CriticalShot];
  const d = new Model(1, 7).setProp('hardyx', 6);
  // Two guaranteed, unblocked crits share one D3.
  expectDamage(a, d, [[15, 1 / 3], [16, 1 / 3], [17, 1 / 3]], 2);
});

it('Aerial Agility retries only on normal damage and stops after one successful ignore per shot', () => {
  const d = undefended().setAbility(Ability.AerialAgility);
  expectDamage(hits(1, 2), d, [[10, 5 / 9], [13, 4 / 9]]);
});

it('Scry Protection chooses an eligible fail or normal against the rolled attack', () => {
  const d = new Model(1, 7).setAbility(Ability.ScryProtection);
  expectDamage(hits(0, 1), d, [[0, 1]]);
  d.diceStat = 1;
  d.hardyx = 7;
  expectDamage(hits(1, 0), d, [[0, 1]]);
  d.autoNorms = 1;
  expectDamage(hits(1, 0), d, [[7, 1]]);
});

it('Acts of Faith share their points between shots and permit only distinct acts with an available Icon', () => {
  const a = new Model(1, 7, 3, 7).setAbility(Ability.ActsOfFaith);
  expectDamage(a, undefended(), [[3, 1]], 2);
  const roll = {fresh: [2, 4], rerolled: [], cursed: 0, prob: 1};
  a.diceStat = 3;
  a.faithPoints = 5;
  a.setAbility(Ability.IconOfFaith);
  const score = (r: {crits: number[]; norms: number[]}) => r.crits.length * 7 + r.norms.length * 3;
  const choices = chooseFactionRoll({model: a, autoNorms: 0, autoCrits: 0}, roll, score);
  expect(choices).toHaveLength(1);
  expect(choices[0].dice).toMatchObject({crits: [0], norms: [0], faith: 5, used: [Ability.ActsOfFaith, Ability.IconOfFaith]});
  const locked = chooseFactionRoll({model: a, autoNorms: 0, autoCrits: 0},
    {fresh: [], rerolled: [1, 1], cursed: 0, prob: 1}, score);
  expect(locked[0].dice).toMatchObject({crits: [], norms: [0], faith: 3});
});

it('can resolve Severe before spending Blessing on a separate rolled normal', () => {
  const model = new Model().setAbility(Ability.ActsOfFaith).setAbility(Ability.Severe);
  const chosen = chooseFactionRoll({model, autoNorms: 0, autoCrits: 0},
    {fresh: [], rerolled: [3, 4], cursed: 0, prob: 1}, dice => dice.crits.length);
  expect(chosen[0].dice).toMatchObject({crits: [0, 0], norms: [], faith: 2});
});
