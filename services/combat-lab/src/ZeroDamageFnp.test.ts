import Model from './Model';
import ShootOptions from './ShootOptions';
import { calcDmgProbs } from './CalcEngineShoot';
import { calcDamage } from './CalcEngineShootInternal';
import { weightedAverage } from './Util';

describe.each([[0, 4], [4, 0]])('FNP with damage %i/%i', (normal, critical) => {
  // Retain one critical hit and make the remaining die a guaranteed normal hit.
  const attacker = new Model(2, 3, normal, critical).withAlwaysNorm();
  attacker.autoCrits = 1;
  attacker.apx = 3;
  const defender = Model.basicDefender().setProp('fnp', 4);

  it('only reduces the damaging hit', () => {
    const probabilities = calcDmgProbs(attacker, defender);
    expect(probabilities.get(3)).toBeCloseTo(0.5);
    expect(probabilities.get(4)).toBeCloseTo(0.5);
    expect(probabilities.get(2) ?? 0).toBe(0);
    expect(weightedAverage(probabilities)).toBeCloseTo(3.5);
  });

  it.each([1, 2])('combines correctly with Saintly Relics over %i rounds', (numRounds) => {
    const options = new ShootOptions();
    options.numRounds = numRounds;
    const probabilities = calcDmgProbs(attacker, defender.withProp('saintlyRelics', 1), options);
    expect(weightedAverage(probabilities)).toBeCloseTo(numRounds * (5 / 6) * 3.5);
    expect(Array.from(probabilities.values()).reduce((sum, p) => sum + p, 0)).toBeCloseTo(1);
  });
});

it.each([0, 1])('retains one FNP roll for Devastating with 0/0 damage and %i critical saves', (criticalSaves) => {
  const attacker = new Model(2, 3, 0, 0, 2);
  const result = calcDamage(attacker, Model.basicDefender(), 1, 1, criticalSaves, 0);
  expect(result.damage).toBe(2);
  expect(result.numHits).toBe(1);
});

it('counts no damaging hits for a 0/0 profile without Devastating', () => {
  const result = calcDamage(new Model(2, 3, 0, 0), Model.basicDefender(), 1, 1, 0, 0);
  expect(result.damage).toBe(0);
  expect(result.numHits).toBe(0);
});
