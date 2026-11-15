import Ability from 'src/Ability';
import DieProbs from 'src/DieProbs';
import Model from 'src/Model';
import { calcFinalDiceProbsForAttacker } from 'src/CalcEngineCommon';
import { calcDmgProbs } from 'src/CalcEngineShoot';
import { calcRemainingWounds } from 'src/CalcEngineFight';
import { getFightStateFromUrl, getStateFromUrl } from 'src/hooks/useUrlState';

// Curse of Rot: each 3 the enemy rolls is a fail it can't re-roll, and deals 1 damage to that enemy.
// These tests check the exact engine against brute-force enumeration of every die face.

type Dist = Map<string, number>;

function addTo(dist: Dist, key: string, prob: number) {
  dist.set(key, (dist.get(key) ?? 0) + prob);
}

// every sequence of `n` D6 faces, each with probability (1/6)^n
function allRolls(n: number): number[][] {
  let rolls: number[][] = [[]];
  for (let i = 0; i < n; i++) {
    rolls = rolls.flatMap(r => [1, 2, 3, 4, 5, 6].map(face => [...r, face]));
  }
  return rolls;
}

// Brute force of the attack roll with Curse of Rot: 3s are set aside as fails, then the re-roll
// rule runs on the other dice. Returns a distribution over "crits,norms".
function bruteForceCursedHits(numDice: number, bs: number, reroll: Ability): Dist {
  const critAt = 6;
  const isFail = (face: number) => face < bs;
  const isCrit = (face: number) => face >= critAt;
  const dist: Dist = new Map();
  const tally = (dice: number[], prob: number) => {
    const crits = dice.filter(isCrit).length;
    const norms = dice.filter(face => !isCrit(face) && !isFail(face)).length;
    addTo(dist, `${crits},${norms}`, prob);
  };

  for (const roll of allRolls(numDice)) {
    const prob = Math.pow(1 / 6, numDice);
    const free = roll.filter(face => face !== 3); // cursed 3s are fails and can't be re-rolled

    // indices of the free dice that this re-roll rule re-rolls
    let toReroll: number[] = [];
    if (reroll === Ability.Relentless) {
      toReroll = free.flatMap((face, i) => (isFail(face) ? [i] : []));
    } else if (reroll === Ability.RerollOnes) {
      toReroll = free.flatMap((face, i) => (face === 1 ? [i] : []));
    } else if (reroll === Ability.Balanced) {
      toReroll = free.flatMap((face, i) => (isFail(face) ? [i] : [])).slice(0, 1);
    } else if (reroll === Ability.DoubleBalanced) {
      toReroll = free.flatMap((face, i) => (isFail(face) ? [i] : [])).slice(0, 2);
    }

    for (const rerolled of allRolls(toReroll.length)) {
      const dice = [...free];
      toReroll.forEach((index, j) => { dice[index] = rerolled[j]; });
      tally(dice, prob * Math.pow(1 / 6, toReroll.length));
    }
  }
  return dist;
}

function engineHits(attacker: Model, defender: Model): Dist {
  const dist: Dist = new Map();
  for (const fdp of calcFinalDiceProbsForAttacker(attacker, defender)) {
    addTo(dist, `${fdp.crits},${fdp.norms}`, fdp.prob);
  }
  return dist;
}

function expectDistsClose(actual: Dist, expected: Dist) {
  const keys = new Set([...actual.keys(), ...expected.keys()]);
  for (const key of keys) {
    expect([key, actual.get(key) ?? 0]).toEqual([key, expect.closeTo(expected.get(key) ?? 0, 10)]);
  }
}

describe(DieProbs.fromSkillsAfterCurse.name, () => {
  it('drops the 3 from the first roll', () => {
    // BS 3+, no re-roll: faces 1,2,4,5,6 => crit 6, norm 4/5, fail 1/2
    const probs = DieProbs.fromSkillsAfterCurse(6, 3, Ability.None);
    expect(probs.crit).toBeCloseTo(1 / 5, 10);
    expect(probs.norm).toBeCloseTo(2 / 5, 10);
    expect(probs.fail).toBeCloseTo(2 / 5, 10);
    expect(probs.failFaces).toBe(2);
    // a later re-roll is a fresh D6
    expect(probs.rerollProbs.crit).toBeCloseTo(1 / 6, 10);
    expect(probs.rerollProbs.norm).toBeCloseTo(3 / 6, 10);
  });

  it('re-rolls fails with a fresh D6 under Relentless', () => {
    const probs = DieProbs.fromSkillsAfterCurse(6, 3, Ability.Relentless);
    expect(probs.crit).toBeCloseTo(1 / 5 + (2 / 5) * (1 / 6), 10);
    expect(probs.norm).toBeCloseTo(2 / 5 + (2 / 5) * (3 / 6), 10);
  });
});

describe('Curse of Rot on the attack dice (exact engine vs brute force)', () => {
  const defender = Model.basicDefender().setAbility(Ability.CurseOfRot);
  it.each([
    [Ability.None, 3],
    [Ability.None, 4],
    [Ability.Relentless, 3],
    [Ability.Relentless, 4],
    [Ability.RerollOnes, 3],
    [Ability.Balanced, 3],
    [Ability.Balanced, 4],
    [Ability.DoubleBalanced, 4],
  ])('%s at BS %i+', (reroll, bs) => {
    const attacker = new Model(3, bs);
    attacker.reroll = reroll;
    expectDistsClose(engineHits(attacker, defender), bruteForceCursedHits(3, bs, reroll));
  });

  it('only applies when the enemy has it', () => {
    const attacker = new Model(3, 3);
    const plain = engineHits(attacker, Model.basicDefender());
    const self = engineHits(attacker.withProp('abilities', new Set([Ability.CurseOfRot])), Model.basicDefender());
    expectDistsClose(self, plain);
  });
});

describe('Curse of Rot on the defence dice adds damage', () => {
  it('matches brute force: one sure normal hit for 3 vs three 3+ saves', () => {
    const attacker = new Model(1, 3, 3, 4).withAlwaysNorm().setAbility(Ability.CurseOfRot);
    const defender = Model.basicDefender(3, 12);

    const expected = new Map<number, number>();
    for (const roll of allRolls(3)) {
      const cursed = roll.filter(face => face === 3).length;
      const saved = roll.some(face => face >= 3 && face !== 3);
      const damage = (saved ? 0 : 3) + cursed;
      expected.set(damage, (expected.get(damage) ?? 0) + Math.pow(1 / 6, 3));
    }

    const actual = calcDmgProbs(attacker, defender);
    for (const damage of new Set([...actual.keys(), ...expected.keys()])) {
      expect([damage, actual.get(damage) ?? 0]).toEqual([damage, expect.closeTo(expected.get(damage) ?? 0, 10)]);
    }
  });

  it('gives each curse damage its own Feel No Pain roll', () => {
    // attack that can never hit past the saves: only curse damage gets through
    const attacker = new Model(1, 3, 0, 0).withAlwaysNorm().setAbility(Ability.CurseOfRot);
    const defender = Model.basicDefender(3, 12);
    defender.fnp = 4;
    const avg = (dist: Map<number, number>) => Array.from(dist).reduce((sum, [d, p]) => sum + d * p, 0);
    // 3 defence dice, 1/6 chance each is a 3, half of those damage instances survive 4+ FNP
    expect(avg(calcDmgProbs(attacker, defender))).toBeCloseTo(3 * (1 / 6) * (1 / 2), 10);
  });
});

describe('Curse of Rot in a fight', () => {
  it('costs the cursed fighter about 1 wound per six dice', () => {
    const roller = new Model(6, 3, 0, 0);
    roller.wounds = 12;
    const plagueMarine = new Model(1, 6, 0, 0).setAbility(Ability.CurseOfRot);
    plagueMarine.wounds = 12;

    const [rollerWounds] = calcRemainingWounds(roller, plagueMarine);
    const avgLeft = Array.from(rollerWounds).reduce((sum, [w, p]) => sum + w * p, 0);
    // the Plague Marine deals no strike damage, so every lost wound is a cursed 3
    expect(avgLeft).toBeCloseTo(11, 1);

    const [uncursed] = calcRemainingWounds(roller, plagueMarine.withProp('abilities', new Set()));
    expect(uncursed.get(12)).toBe(1);
  });
});

describe('Curse of Rot share links', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('round-trips on the attacker, defender, and fighter', () => {
    window.history.replaceState({}, '', '/?a1=4:3:3:4:0:0:0:X:0:0:0:0:0:curse&d1=3:12:0:0:0:0:0:0:X:curse:0');
    const shoot = getStateFromUrl().s1!;
    expect(shoot.attacker.has(Ability.CurseOfRot)).toBe(true);
    expect(shoot.defender.has(Ability.CurseOfRot)).toBe(true);

    window.history.replaceState({}, '', '/fight?fa=12:4:3:3:4:X:0:0:0:0:0::curse:0:0');
    expect(getFightStateFromUrl()!.fighterA.has(Ability.CurseOfRot)).toBe(true);
  });
});
