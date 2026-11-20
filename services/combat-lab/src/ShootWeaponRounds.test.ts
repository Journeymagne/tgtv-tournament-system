import {calcDmgProbs} from './CalcEngineShoot';
import {combineDmgProbs} from './CalcEngineCommon';
import Model from './Model';
import ShootOptions from './ShootOptions';

it('applies Lethal and Piercing to independently selected shots', () => {
  const attacker = new Model(3, 4, 2, 5).setProp('lethal', 5).setProp('apx', 1);
  attacker.shootWeaponRounds = {lethal: 'first', apx: 'second'};
  const defender = Model.basicDefender(4);
  const both = calcDmgProbs(attacker, defender, new ShootOptions(2));
  const first = new Model(3, 4, 2, 5).setProp('lethal', 5);
  const second = new Model(3, 4, 2, 5).setProp('apx', 1);
  const expected = combineDmgProbs(calcDmgProbs(first, defender), calcDmgProbs(second, defender));
  for (const damage of new Set([...both.keys(), ...expected.keys()]))
    expect(both.get(damage) ?? 0).toBeCloseTo(expected.get(damage) ?? 0, 10);
  expect(attacker.apx).toBe(1);
  expect(attacker.lethal).toBe(5);
});

it('applies second-shot Piercing Crits once even if the series is shortened or extended', () => {
  const attacker = new Model(1, 3, 2, 5).setProp('autoCrits', 1).setProp('px', 1);
  attacker.shootWeaponRounds = {px: 'second'};
  const defender = new Model(1).setProp('autoCrits', 1);
  expect(calcDmgProbs(attacker, defender, new ShootOptions(1)).get(0)).toBeCloseTo(1);
  expect(calcDmgProbs(attacker, defender, new ShootOptions(3)).get(5)).toBeCloseTo(1);
});
