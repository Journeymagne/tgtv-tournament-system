import Ability from 'src/Ability';
import Model from 'src/Model';
import type {FacePool} from 'src/FaceDice';

// Zero is an automatic success. A rolled die keeps its numerical result even
// when retained as a different kind of success (Core Rules, Designer's Commentary).
export interface Retention {
  crits: number[];
  norms: number[];
  faith: number;
  used: Ability[];
}
interface Roll {
  crits: number[];
  norms: number[];
  fails: number[];
  locked: number[]; // normal successes already retained, e.g. Accurate or Intervention
  used: Ability[];
  faith: number;
  acts: number;
}
type Pile = 'crits' | 'norms' | 'fails' | 'locked';
export type RollScore = (retention: Retention) => number;
export interface WeightedRetention { dice: Retention; prob: number }

function remove(pile: number[], face: number): number[] {
  const next = pile.slice();
  next.splice(next.indexOf(face), 1);
  return next;
}

function move(roll: Roll, from: Pile, to: Pile, rule?: Ability, cost = 0): Roll[] {
  return [...new Set(roll[from])].map(face => ({
    ...roll, [from]: remove(roll[from], face), [to]: [...roll[to], face],
    faith: roll.faith + cost, used: rule ? [...roll.used, rule] : roll.used,
  }));
}

const sort = (faces: number[]) => faces.sort((a, b) => a - b);
export const retentionKey = (r: Retention) => r.crits.join('') + '/' + r.norms.join('');

interface DiceContext {
  model: Model;
  autoCrits: number;
  autoNorms: number;
  defence?: boolean;
  obscured?: boolean;
  shielded?: boolean;
  keepFaces?: boolean;
}

// A retention removes its source die from the eligible pile. Severe and the
// generic fail conversion *change* dice, so their wording differs. Numerical
// faces are needed only for Domino Field; elsewhere equal dice share a bucket.
function retentions(context: DiceContext, faces: number[], guidance: boolean): Retention[] {
  const {model, autoCrits, autoNorms, defence, obscured, shielded, keepFaces} = context;
  const roll: Roll = {crits: Array(autoCrits).fill(0), locked: Array(autoNorms).fill(0),
    norms: [], fails: [], used: guidance ? [Ability.ActsOfFaith] : [], faith: Number(guidance), acts: Number(guidance)};
  for (const face of faces) {
    const pile = face < model.diceStat ? roll.fails :
      face >= (shielded ? 6 : model.critSkill()) ? roll.crits : roll.norms;
    pile.push(keepFaces ? face : 0);
  }
  let choices = [roll];
  const optional = (action: (r: Roll) => Roll[]) => {
    choices = choices.flatMap(r => [r, ...action(r)]);
  };
  const required = (action: (r: Roll) => Roll[]) => {
    choices = choices.flatMap(r => { const next = action(r); return next.length ? next : [r]; });
  };
  const faith = model.has(Ability.ActsOfFaith);
  const maxActs = model.has(Ability.IconOfFaith) ? 2 : 1;
  const act = (from: Pile, to: Pile, cost: number, bit: number) => optional(r => {
    const acts = r.used.filter(a => a === Ability.ActsOfFaith).length;
    if ((r.acts & bit) || acts >= maxActs || r.faith + cost > model.faithPoints) return [];
    return move({...r, acts: r.acts | bit}, from, to, Ability.ActsOfFaith, cost);
  });
  const scry = defence ? Ability.ScryProtection : Ability.MysticScryBuff;
  const applyFaithAndScry = () => {
    if (faith && !shielded) act('norms', 'crits', 2, 2);
    if (faith) act('fails', 'locked', 3, 4);
    if (model.has(scry)) optional(r => r.used.includes(scry) ? [] : [
      ...move(r, 'fails', 'locked', scry), ...(shielded ? [] : move(r, 'norms', 'crits', scry)),
    ]);
  };
  applyFaithAndScry();
  if (!defence && model.has(Ability.BlessingsOfInfection)) optional(r => {
    const results: Roll[] = [];
    if (r.fails.length >= 3) {
      for (const face of new Set(r.fails))
        results.push(...move({...r, fails: remove(r.fails, face)}, 'fails', 'locked', Ability.BlessingsOfInfection));
    }
    if (!shielded && r.crits.length + r.norms.length >= 3)
      for (const face of new Set(r.fails))
        results.push(...move({...r, fails: remove(r.fails, face)}, 'norms', 'crits', Ability.BlessingsOfInfection));
    return results;
  });
  if (!obscured && model.has(Ability.Punishing))
    optional(r => r.crits.length ? move(r, 'fails', 'locked', Ability.Punishing) : []);
  const seal = defence ? Ability.Indomitus : Ability.PuritySeal;
  if (model.has(seal)) optional(r => r.fails.length < 2 ? [] : Array.from(new Set(r.fails)).flatMap(face =>
    move({...r, fails: remove(r.fails, face)}, 'fails', 'locked', seal)));
  for (let i = 0; i < Math.min(model.failsToNorms, faces.length); i++)
    required(r => move(r, 'fails', 'norms'));
  if (!shielded && model.has(Ability.Severe))
    optional(r => r.crits.length ? [] : [...move(r, 'norms', 'crits', Ability.Severe),
      ...move(r, 'locked', 'crits', Ability.Severe)]);
  // A retained crit may enable Punishing. Equally, Severe can change a
  // separate die first, leaving another rolled normal for Blessing or Scry.
  if (model.has(Ability.Severe) || model.failsToNorms > 0) applyFaithAndScry();
  if (!shielded) {
    for (let i = 0; i < Math.min(model.normsToCrits, faces.length); i++)
      required(r => move(r, 'norms', 'crits'));
    if (defence && model.has(Ability.TranshumanPhysiology))
      optional(r => move(r, 'norms', 'crits', Ability.TranshumanPhysiology));
    if (model.has(Ability.Rending)) optional(r =>
      r.crits.length && !r.used.includes(Ability.Severe) ? move(r, 'norms', 'crits', Ability.Rending) : []);
  }
  const results = new Map<string, Retention>();
  for (const r of choices) {
    const allNorms = [...r.norms, ...r.locked];
    const crits = obscured ? [] : sort(r.crits.slice());
    const possibleNorms = obscured ? [...allNorms, ...r.crits] : allNorms;
    const norms = obscured && possibleNorms.length
      ? Array.from(new Set(possibleNorms), face => remove(possibleNorms, face)) : [possibleNorms];
    for (const n of norms) {
      const acts = r.used.filter(a => a === Ability.ActsOfFaith).length;
      const used = [...new Set(r.used)];
      if (acts === 2) used.push(Ability.IconOfFaith);
      const result = {crits, norms: sort(n), used, faith: r.faith};
      const key = retentionKey(result);
      const prev = results.get(key);
      if (!prev || result.faith < prev.faith || (result.faith === prev.faith && used.length < prev.used.length))
        results.set(key, result);
    }
  }
  return [...results.values()];
}

export function prepareFactionRoll(context: DiceContext, pool: FacePool): (score: RollScore) => WeightedRetention[] {
  const all = [...pool.fresh, ...pool.rerolled];
  const base = retentions(context, all, false);
  const rerolls: Retention[][][] = [];
  if (context.model.has(Ability.ActsOfFaith) && context.model.faithPoints > 0) {
    for (const face of new Set(pool.fresh)) {
      const remaining = remove(all, face);
      rerolls.push(Array.from({length: 6}, (_, i) => retentions(context, [...remaining, i + 1], true)));
    }
  }
  if (base.length === 1 && !rerolls.length) {
    const option = [{dice: base[0], prob: 1}];
    return () => option;
  }
  function best(candidates: Retention[], score: RollScore): {dice: Retention; value: number} {
    let chosen: Retention | undefined;
    let value = -Infinity;
    for (const dice of candidates) {
      const v = score(dice);
      if (v > value + 1e-9 || (Math.abs(v - value) < 1e-9 &&
        (!chosen || dice.faith < chosen.faith || (dice.faith === chosen.faith && dice.used.length < chosen.used.length)))) {
        chosen = dice;
        value = v;
      }
    }
    return {dice: chosen!, value};
  }
  return score => {
    const straight = best(base, score);
    let value = straight.value;
    let chosen = [{dice: straight.dice, prob: 1}];
    // Choose Guidance before seeing the re-roll; Icon's remaining act may
    // react to the result. Ties conserve Faith.
    for (const reroll of rerolls) {
      const branches = reroll.map(options => best(options, score));
      const average = branches.reduce((sum, b) => sum + b.value / 6, 0);
      const cost = branches.reduce((sum, b) => sum + b.dice.faith / 6, 0);
      const oldCost = chosen.reduce((sum, b) => sum + b.prob * b.dice.faith, 0);
      if (average > value + 1e-9 || (Math.abs(average - value) < 1e-9 && cost < oldCost - 1e-9)) {
        chosen = branches.map(b => ({dice: b.dice, prob: 1 / 6}));
        value = average;
      }
    }
    return chosen;
  };
}

export function chooseFactionRoll(context: DiceContext, pool: FacePool, score: RollScore): WeightedRetention[] {
  return prepareFactionRoll(context, pool)(score);
}
