import Ability from 'src/Ability';
import Model from 'src/Model';

export interface FacePool {
  prob: number;
  fresh: number[];
  rerolled: number[];
  cursed: number;
}

interface Roll {
  faces: number[];
  prob: number;
}

// Enumerate unordered rolls. Adding one die to a sorted pool accumulates the
// multiplicities of its ordered permutations without enumerating all 6^n rolls.
const rawRolls = new Map<number, Roll[]>([[0, [{faces: [], prob: 1}]]]);

function addRoll(rows: Map<string, Roll>, faces: number[], prob: number) {
  const key = faces.join('');
  const row = rows.get(key);
  if (row) row.prob += prob;
  else rows.set(key, {faces, prob});
}

function diceRolls(count: number): Roll[] {
  const cached = rawRolls.get(count);
  if (cached) return cached;
  const rows = new Map<string, Roll>();
  for (const roll of diceRolls(count - 1)) {
    for (let face = 1; face <= 6; face++) {
      const next = [...roll.faces, face].sort((a, b) => a - b);
      addRoll(rows, next, roll.prob / 6);
    }
  }
  const result = [...rows.values()];
  rawRolls.set(count, result);
  return result;
}

// Balanced rerolls the first eligible fail in roll order. Given just the
// unordered pool, each eligible die is equally likely to occupy that position.
function keepAfterBalanced(faces: number[], limit: number, hit: number, prob: number,
                           keep: (faces: number[], prob: number) => void) {
  const fails = faces.filter(face => face < hit);
  if (!limit || !fails.length) {
    keep(faces, prob);
    return;
  }
  for (const face of new Set(fails)) {
    const next = [...faces];
    next.splice(next.indexOf(face), 1);
    const chance = fails.filter(value => value === face).length / fails.length;
    keepAfterBalanced(next, limit - 1, hit, prob * chance, keep);
  }
}

function keptDice(faces: number[], model: Model, keep: (faces: number[], prob: number) => void) {
  const hit = model.diceStat;
  const reroll = model.reroll;
  switch (reroll) {
    case Ability.Relentless:
      return keep(faces.filter(face => face >= hit), 1);
    case Ability.CritFishRelentless:
      return keep(faces.filter(face => face >= Math.max(hit, model.critSkill())), 1);
    case Ability.RerollOnes:
    case Ability.RerollOnesPlusBalanced:
      return keepAfterBalanced(faces.filter(face => face !== 1),
        Number(reroll === Ability.RerollOnesPlusBalanced), hit, 1, keep);
    case Ability.Balanced:
    case Ability.DoubleBalanced:
      return keepAfterBalanced(faces, reroll === Ability.Balanced ? 1 : 2, hit, 1, keep);
    case Ability.RerollMostCommonFail:
    case Ability.RerollMostCommonFailPlusBalanced: {
      const counts = Array<number>(7).fill(0);
      for (const face of faces) if (face < hit) counts[face]++;
      const highest = Math.max(...counts);
      if (!highest) return keep(faces, 1);
      const tied = [1, 2, 3, 4, 5, 6].filter(face => counts[face] === highest);
      for (const face of tied) {
        keepAfterBalanced(faces.filter(value => value !== face),
          Number(reroll === Ability.RerollMostCommonFailPlusBalanced), hit, 1 / tied.length, keep);
      }
      return;
    }
    default:
      return keep(faces, 1);
  }
}

/** numDice is the number actually rolled, after Accurate and cover retentions. */
export function rolledFacePools(numDice: number, model: Model, cursed: boolean, keepFaces: boolean): FacePool[] {
  const crit = Math.max(1, model.diceStat, model.critSkill());
  const normal = Math.max(1, model.diceStat);
  const classify = (faces: number[]) => keepFaces ? faces :
    faces.map(face => face >= crit ? crit : face >= normal ? normal : 1);
  const kept = new Map<string, {fresh: number[]; count: number; cursed: number; prob: number}>();
  for (const roll of diceRolls(numDice)) {
    const eligible = cursed ? roll.faces.filter(face => face !== 3) : roll.faces;
    const locked = numDice - eligible.length;
    keptDice(eligible, model, (faces, prob) => {
      const fresh = classify(faces);
      const count = eligible.length - fresh.length;
      const key = [locked, count, fresh.join('')].join('/');
      const existing = kept.get(key);
      if (existing) existing.prob += roll.prob * prob;
      else kept.set(key, {fresh, count, cursed: locked, prob: roll.prob * prob});
    });
  }
  const replacements = new Map<number, Roll[]>();
  const result: FacePool[] = [];
  for (const plan of kept.values()) {
    let rolls = replacements.get(plan.count);
    if (!rolls) {
      rolls = diceRolls(plan.count);
      if (!keepFaces) {
        const groups = new Map<string, Roll>();
        for (const roll of rolls) addRoll(groups, classify(roll.faces), roll.prob);
        rolls = [...groups.values()];
      }
      replacements.set(plan.count, rolls);
    }
    for (const roll of rolls) result.push({
      fresh: plan.fresh, rerolled: roll.faces, cursed: plan.cursed, prob: plan.prob * roll.prob,
    });
  }
  return result;
}
