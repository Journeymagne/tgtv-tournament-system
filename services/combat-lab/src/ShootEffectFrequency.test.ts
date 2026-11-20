import Ability from 'src/Ability';
import { calcDmgProbs } from 'src/CalcEngineShoot';
import Model from 'src/Model';
import ShootOptions from 'src/ShootOptions';
import { SaintlyRelicsNormal } from 'src/SaintlyRelics';
import {hydrate} from 'src/simulation/model';

function shoot(attacker: Model, defender: Model, rounds = 3): Map<number, number> {
  return calcDmgProbs(attacker, defender, new ShootOptions(rounds));
}

function expectDistribution(actual: Map<number, number>, entries: Array<[number, number]>): void {
  const expected = new Map(entries);
  for (const damage of new Set([...actual.keys(), ...expected.keys()])) {
    expect(actual.get(damage) ?? 0).toBeCloseTo(expected.get(damage) ?? 0, 10);
  }
  expect([...actual.values()].reduce((sum, probability) => sum + probability, 0)).toBeCloseTo(1, 10);
  for (const probability of actual.values()) expect(probability).toBeGreaterThanOrEqual(0);
}

describe('shooting effect frequency across repeated Shoot actions', () => {
  it('ignores the first actual normal hit once, including after a missed action', () => {
    // One normal hit on 4+, never a crit: H ~ Binomial(3, 1/2).
    // Once Scratch leaves max(H - 1, 0) damaging hits; every-action Scratch leaves none.
    const attacker = new Model(1, 4, 3, 3).setProp('lethal', 7);
    const defender = new Model(0).setAbility(Ability.JustAScratchNorms);
    expectDistribution(shoot(attacker, defender), [[0, 1]]);
    defender.shootOnceAbilities = [Ability.JustAScratchNorms];
    expectDistribution(shoot(attacker, defender), [[0, 1 / 2], [3, 3 / 8], [6, 1 / 8]]);
  });

  it('keeps normal-only Scratch available after a critical hit', () => {
    // Per action: fail 1/3, normal 1/2, crit 1/6. Only the first normal is ignored.
    // Two crits still deal 6; two normals deal 3 once, but 0 with every-action Scratch.
    const attacker = new Model(1, 3, 3, 3);
    const defender = new Model(0).setAbility(Ability.JustAScratchNorms);
    expectDistribution(shoot(attacker, defender, 2), [[0, 25 / 36], [3, 10 / 36], [6, 1 / 36]]);
    defender.shootOnceAbilities = [Ability.JustAScratchNorms];
    expectDistribution(shoot(attacker, defender, 2), [[0, 16 / 36], [3, 19 / 36], [6, 1 / 36]]);
  });

  it('migrates both legacy Scratch selections to one normal-only use', () => {
    const attacker = new Model(1, 1, 3, 3).setProp('lethal', 7);
    const variants = [Ability.JustAScratch, Ability.JustAScratchNorms];
    const defender = hydrate({numDice: 0, abilities: variants, shootOnceAbilities: variants});
    expect(defender.abilities).toEqual(new Set([Ability.JustAScratchNorms]));
    expect(defender.shootOnceAbilities).toEqual([Ability.JustAScratchNorms]);
    expectDistribution(shoot(attacker, defender), [[6, 1]]);
    expectDistribution(shoot(attacker.withAlwaysCrit(), defender), [[9, 1]]);
    const raw = new Model(0).setAbility(Ability.JustAScratch);
    raw.shootOnceAbilities = [Ability.JustAScratch];
    expectDistribution(shoot(attacker.withAlwaysCrit(), raw), [[9, 1]]);
  });

  it('uses Purity Seal once across three all-failed attack rolls', () => {
    const attacker = new Model(2, 7, 3, 5).setProp('lethal', 7).setAbility(Ability.PuritySeal);
    const defender = new Model(0);
    expectDistribution(shoot(attacker, defender), [[9, 1]]);
    attacker.shootOnceAbilities = [Ability.PuritySeal];
    expectDistribution(shoot(attacker, defender), [[3, 1]]);
  });

  it.each([
    [3, 5, 11, 15],
    [5, 3, 15, 15],
  ])('Severe with damage %i/%i spends only a chosen improvement', (normal, critical, onceDamage, eachDamage) => {
    const attacker = new Model(1, 1, normal, critical).setProp('lethal', 7).setAbility(Ability.Severe);
    const defender = new Model(0);
    expectDistribution(shoot(attacker, defender), [[eachDamage, 1]]);
    attacker.shootOnceAbilities = [Ability.Severe];
    expectDistribution(shoot(attacker, defender), [[onceDamage, 1]]);
  });

  it('retains unused Severe until the first roll with a normal success', () => {
    // Crits are impossible. Once Severe upgrades the first success, even if earlier rolls failed.
    const attacker = new Model(1, 4, 3, 5).setProp('lethal', 7).setAbility(Ability.Severe);
    const defender = new Model(0);
    expectDistribution(shoot(attacker, defender), [[0, 1 / 8], [5, 3 / 8], [10, 3 / 8], [15, 1 / 8]]);
    attacker.shootOnceAbilities = [Ability.Severe];
    expectDistribution(shoot(attacker, defender), [[0, 1 / 8], [5, 3 / 8], [8, 3 / 8], [11, 1 / 8]]);
  });

  it('uses Mystic Scry once for the chosen critical promotion', () => {
    const attacker = new Model(2, 1, 3, 8).setProp('lethal', 7).setAbility(Ability.MysticScryBuff);
    const defender = new Model(0);
    expectDistribution(shoot(attacker, defender), [[33, 1]]);
    attacker.shootOnceAbilities = [Ability.MysticScryBuff];
    expectDistribution(shoot(attacker, defender), [[23, 1]]);
  });

  it('keeps Transhuman available after failed saves, then spends the first promotion', () => {
    const attacker = new Model(1, 1, 3, 4).setProp('lethal', 1);
    const defender = new Model(1, 4).setProp('lethal', 7).setAbility(Ability.TranshumanPhysiology);
    // A normal save alone cannot block the critical hit. Transhuman blocks on the first 4+.
    expectDistribution(shoot(attacker, defender), [[0, 1 / 8], [4, 3 / 8], [8, 3 / 8], [12, 1 / 8]]);
    defender.shootOnceAbilities = [Ability.TranshumanPhysiology];
    expectDistribution(shoot(attacker, defender), [[8, 7 / 8], [12, 1 / 8]]);
  });

  it('applies once Obscured to the whole first Shoot, then restores critical hits', () => {
    const attacker = new Model(2, 1, 3, 5).setProp('lethal', 1);
    const defender = new Model(0).setAbility(Ability.ObscuredTarget);
    // Obscured converts both crits to normals and discards one success: 3 instead of 10.
    expectDistribution(shoot(attacker, defender), [[9, 1]]);
    defender.shootOnceAbilities = [Ability.ObscuredTarget];
    expectDistribution(shoot(attacker, defender), [[23, 1]]);
  });

  it('expires attacker Curse after the first Shoot even when no cursed die was rolled', () => {
    // Zero weapon damage isolates Curse: each of two defence dice causes 1 on a 3.
    const attacker = new Model(1, 1, 0, 0).setProp('lethal', 7).setAbility(Ability.CurseOfRot);
    const defender = new Model(2, 7).setProp('lethal', 7);
    expectDistribution(shoot(attacker, defender, 2), [
      [0, 625 / 1296], [1, 500 / 1296], [2, 150 / 1296], [3, 20 / 1296], [4, 1 / 1296],
    ]);
    attacker.shootOnceAbilities = [Ability.CurseOfRot];
    expectDistribution(shoot(attacker, defender, 2), [[0, 25 / 36], [1, 10 / 36], [2, 1 / 36]]);
  });

  it('expires defender Curse after one Shoot and restores attack successes on a 3', () => {
    const attacker = new Model(1, 3, 3, 3).setProp('lethal', 7);
    const defender = new Model(0).setAbility(Ability.CurseOfRot);
    // Cursed attack succeeds on 4/5/6 (1/2), uncursed on 3/4/5/6 (2/3).
    expectDistribution(shoot(attacker, defender, 2), [[0, 1 / 4], [3, 1 / 2], [6, 1 / 4]]);
    defender.shootOnceAbilities = [Ability.CurseOfRot];
    expectDistribution(shoot(attacker, defender, 2), [[0, 1 / 6], [3, 1 / 2], [6, 1 / 3]]);
  });

  it('tracks both models independently without mutating either model or carrying state between calculations', () => {
    const attacker = new Model(2, 1, 3, 5).setProp('lethal', 7).setProp('autoCrits', 1).setAbility(Ability.Rending);
    const defender = new Model(0).setAbility(Ability.JustAScratchNorms);
    attacker.shootOnceAbilities = [Ability.Rending];
    defender.shootOnceAbilities = [Ability.JustAScratchNorms];
    const attackerAbilities = attacker.abilities;
    const defenderAbilities = defender.abilities;
    const attackerOnce = attacker.shootOnceAbilities;
    const defenderOnce = defender.shootOnceAbilities;
    // Rending makes two crits in Shoot one. Scratch ignores the normal in
    // Shoot two. The three actions therefore inflict 10, 5 and 8 damage.
    expectDistribution(shoot(attacker, defender), [[23, 1]]);
    expectDistribution(shoot(attacker, defender), [[23, 1]]);
    expect(attacker.abilities).toBe(attackerAbilities);
    expect(attacker.abilities).toEqual(new Set([Ability.Rending]));
    expect(defender.abilities).toBe(defenderAbilities);
    expect(defender.abilities).toEqual(new Set([Ability.JustAScratchNorms]));
    expect(attacker.shootOnceAbilities).toBe(attackerOnce);
    expect(attacker.shootOnceAbilities).toEqual([Ability.Rending]);
    expect(defender.shootOnceAbilities).toBe(defenderOnce);
    expect(defender.shootOnceAbilities).toEqual([Ability.JustAScratchNorms]);
  });

  it('combines once Scratch with FNP and the two-success relic cap across three Shoots', () => {
    const attacker = new Model(2, 1, 2, 2).setProp('lethal', 7);
    const defender = new Model(0).setAbility(Ability.JustAScratchNorms)
      .setProp('fnp', 4).setProp('saintlyRelics', SaintlyRelicsNormal);

    // A relic retries on eligible hits until one ignore succeeds in that Shoot;
    // the battle cap is two successful ignores. No ignore in an action with h hits has
    // probability (5/6)^h. Each surviving 2-damage hit then has one independent 4+ FNP roll.
    const fnpMixture = (hitsPerAction: number[]): Array<[number, number]> => {
      const hitsBeforeRelics = hitsPerAction.reduce((sum, hits) => sum + hits, 0);
      const q = hitsPerAction.map(hits => (5 / 6) ** hits);
      const noIgnores = q[0] * q[1] * q[2];
      const oneIgnore = (1 - q[0]) * q[1] * q[2]
        + q[0] * (1 - q[1]) * q[2] + q[0] * q[1] * (1 - q[2]);
      const ignoreProbabilities = [noIgnores, oneIgnore, 1 - noIgnores - oneIgnore];
      const coefficients = [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1], [1, 4, 6, 4, 1], [1, 5, 10, 10, 5, 1]];
      const expected = new Map<number, number>();
      ignoreProbabilities.forEach((probability, ignores) => {
        const hits = hitsBeforeRelics - ignores;
        coefficients[hits].forEach((ways, fnpSuccesses) => {
          const damage = 2 * hits - fnpSuccesses;
          expected.set(damage, (expected.get(damage) ?? 0) + probability * ways / 2 ** hits);
        });
      });
      return [...expected];
    };

    // Every-action Scratch: capped ignore weights [125,75,16]/216 for [1,1,1] hits.
    expectDistribution(shoot(attacker, defender), fnpMixture([1, 1, 1]));
    defender.shootOnceAbilities = [Ability.JustAScratchNorms];
    // Once Scratch: weights [3125,3375,1276]/7776 for [1,2,2] hits.
    expectDistribution(shoot(attacker, defender), fnpMixture([1, 2, 2]));
  });
});
