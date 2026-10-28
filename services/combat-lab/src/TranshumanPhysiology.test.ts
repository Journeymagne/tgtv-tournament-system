import Ability from 'src/Ability';
import Model from 'src/Model';
import { calcDmgProbs } from 'src/CalcEngineShoot';
import { calcDefenderFinalDiceStuff } from 'src/CalcEngineShootInternal';

describe('Transhuman Physiology shooting defence', () => {
  const attacker = new Model();
  function defender(dice = 3) {
    const model = Model.basicDefender();
    model.numDice = dice;
    model.abilities.add(Ability.TranshumanPhysiology);
    return model;
  }

  it('promotes one normal save, including when another critical save exists', () => {
    const outcomes = calcDefenderFinalDiceStuff(defender(2), attacker).finalDiceProbs;
    const twoCrits = outcomes.filter(o => o.crits === 2).reduce((p, o) => p + o.prob, 0);
    // Two natural sixes, or one six and one 3/4/5. Two normals only promote once.
    expect(twoCrits).toBeCloseTo(7 / 36, 10);
    expect(outcomes.reduce((p, o) => p + o.prob, 0)).toBeCloseTo(1, 10);
  });

  it('does not promote failed dice or change natural critical saves', () => {
    const model = defender(1);
    model.diceStat = 6;
    const enabled = calcDmgProbs(attacker, model);
    model.abilities.clear();
    expect(calcDmgProbs(attacker, model)).toEqual(enabled);
  });

  it('does not promote an automatically retained cover save', () => {
    const model = defender(1);
    model.autoNorms = 1;
    const outcomes = calcDefenderFinalDiceStuff(model, attacker).finalDiceProbs;
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ crits: 0, norms: 1, prob: 1 });
  });

  it('does not promote the success retained by Indomitus', () => {
    const model = defender(2);
    model.diceStat = 6;
    model.abilities.add(Ability.Indomitus);
    const outcomes = calcDefenderFinalDiceStuff(model, attacker).finalDiceProbs;
    const retainedNormal = outcomes.filter(o => o.crits === 0 && o.norms === 1)
      .reduce((p, o) => p + o.prob, 0);
    expect(retainedNormal).toBeCloseTo(25 / 36, 10);
  });

  it.each(['apx', 'px'] as const)('applies with %s and cannot create saves with zero dice', piercing => {
    const model = defender();
    const weapon = new Model(1);
    weapon.autoCrits = 1;
    weapon[piercing] = 2;
    const enabled = calcDmgProbs(weapon, model);
    // One remaining die saves the critical hit on 3+, instead of only on 6.
    expect(enabled.get(0)).toBeCloseTo(4 / 6, 10);
    weapon[piercing] = 3;
    expect(calcDmgProbs(weapon, model).get(weapon.critDmg)).toBeCloseTo(1, 10);
  });

  it('does not apply the defender ability to attack dice', () => {
    const weapon = new Model();
    const model = Model.basicDefender();
    const baseline = calcDmgProbs(weapon, model);
    weapon.abilities.add(Ability.TranshumanPhysiology);
    expect(calcDmgProbs(weapon, model)).toEqual(baseline);
  });
});
