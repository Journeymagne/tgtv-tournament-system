import Model from "src/Model";
import Ability from "src/Ability";
import { applyPostRollModifications, canRankByDamage, chooseAutoNorms, PostRollSuccesses } from "src/CalcEngineCommon";
import { chooseFactionRoll, WeightedRetention } from 'src/FactionDice';

export type RngFunction = () => number; // returns [0, 1)

// Simple seeded PRNG (mulberry32)
export function mulberry32(seed: number): RngFunction {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0)) / 4294967296;
  };
}


// simulateFighterDice runs tens of thousands of times per comparison, so the Accurate decision -
// which enumerates exact distributions - is cached by the inputs that can change it. Cleared only
// by process exit; the key space is tiny (one entry per distinct fighter profile).
const accurateChoiceCache = new Map<string, number>();
const faithRollCache = new Map<string, WeightedRetention[]>();

function spendFaith(model: Model, dice: number[], rerolled: Set<number>, autoCrits: number,
  autoNorms: number, shielded: boolean, obscured: boolean, rng: RngFunction) {
  // Retention cares only about the type of success, but Guidance must distinguish
  // dice already rerolled from fresh ones. Use representative faces for each type.
  const crit = Math.max(model.diceStat, model.critSkill());
  const fresh: number[] = [], replacements: number[] = [];
  dice.forEach((die, i) => {
    const pile = rerolled.has(i) ? replacements : fresh;
    pile.push(die >= crit ? crit : die >= model.diceStat ? model.diceStat : 1);
  });
  fresh.sort(); replacements.sort();
  const key = [fresh.join(','), replacements.join(','), autoCrits, autoNorms, shielded, obscured,
    model.diceStat, model.critSkill(), model.failsToNorms, model.normsToCrits, model.normDmg,
    model.critDmg, model.mwx, model.faithPoints, ...Array.from(model.abilities).sort()].join('|');
  let options = faithRollCache.get(key);
  if (!options) {
    options = chooseFactionRoll({model, autoCrits, autoNorms, shielded, obscured},
      {fresh, rerolled: replacements, prob: 1, cursed: 0}, roll =>
        model.possibleDmg(roll.crits.length, roll.norms.length));
    if (faithRollCache.size >= 8192) faithRollCache.clear();
    faithRollCache.set(key, options);
  }
  // The six possible results of Guidance are returned only after choosing to
  // spend the point. A deterministic retention consumes no further RNG draw.
  let chosen = options[0].dice;
  if (options.length > 1) {
    let sample = rng();
    for (const row of options) {
      chosen = row.dice;
      sample -= row.prob;
      if (sample < 0) break;
    }
  }
  return {crits: chosen.crits.length, norms: chosen.norms.length,
    usedFightAbilities: chosen.used, faithSpent: chosen.faith};
}

// Keyed by VALUE, not by object identity: Model.setProp mutates decision inputs in place and
// setAbility mutates the ability Set in place, so a cache keyed on (model, abilities) identity
// would hand back a stale retention count after any such edit. Building the key is cheap next to
// that risk, and the early return below keeps it off the path entirely unless Accurate is in play.
function accurateDiceToRetain(model: Model, abilities: Set<Ability>, cursed: boolean): number {
  const critDmgPlusMwx = model.critDmg + model.mwx;
  if (model.autoNorms <= 0 || !canRankByDamage(model.normDmg, critDmgPlusMwx)) {
    return model.autoNorms;
  }

  const key = [
    model.numDice, model.diceStat, model.critSkill(), model.reroll,
    model.autoCrits, model.autoNorms, model.failsToNorms, model.normsToCrits,
    model.normDmg, critDmgPlusMwx,
    Array.from(abilities).sort().join('.'),
    cursed,
  ].join('|');

  const cached = accurateChoiceCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const chosen = chooseAutoNorms(
    model.toAttackerDieProbs(), model.numDice, model.reroll, model.autoCrits, model.autoNorms,
    model.failsToNorms, model.normsToCrits, abilities, model.normDmg, critDmgPlusMwx,
    cursed ? model.toCursedAttackerDieProbs() : undefined);
  accurateChoiceCache.set(key, chosen);
  return chosen;
}

export function simulateFighterDice(
  model: Model,
  defender: Model | undefined,
  rng: RngFunction = Math.random,
): PostRollSuccesses & { cursed: number; faithSpent?: number; options?: PostRollSuccesses[] } {
  const shielded = defender?.has(Ability.TiltingShields) ?? false;
  if (shielded) model = model.withProp('lethal', 6).withProp('normsToCrits', 0);
  // lethal must not promote a die that would have failed: clamp critThreshold >= normThreshold
  const critThreshold = Math.max(model.critSkill(), model.diceStat);
  const normThreshold = model.diceStat;

  // Merge defender's ObscuredTarget into abilities if present
  let abilities = model.abilities;
  if (defender?.has(Ability.ObscuredTarget)) {
    abilities = new Set(abilities);
    abilities.add(Ability.ObscuredTarget);
  }

  // Handle auto-dice
  let numDice = model.numDice;
  const autoCrits = Math.min(model.autoCrits, numDice);
  numDice -= autoCrits;
  // Accurate is "retain UP TO x", and retaining fewer is sometimes better (a retained norm can't be
  // promoted). The choice is made before rolling, so it must be the same for every simulation -
  // hence it is decided from the exact distributions and cached, never re-decided per roll.
  const enemyCurses = defender?.has(Ability.CurseOfRot) ?? false;
  const autoNorms = Math.min(accurateDiceToRetain(model, abilities, enemyCurses), numDice);
  numDice -= autoNorms;

  // Roll raw d6 values (inlined rollD6 to avoid function call overhead)
  let dice = new Array<number>(numDice);
  for (let i = 0; i < numDice; i++) {
    dice[i] = (rng() * 6 | 0) + 1;
  }

  // Curse of Rot (enemy's ploy): each 3 on the roll is a fail that can't be re-rolled, and costs
  // this fighter 1 damage (the caller applies it). Set those dice aside before re-rolling.
  let cursed = 0;
  if (enemyCurses) {
    const uncursed = dice.filter(die => die !== 3);
    cursed = dice.length - uncursed.length;
    dice = uncursed;
  }

  // Apply rerolls
  const faithRerolls = model.has(Ability.ActsOfFaith) ? new Set<number>() : undefined;
  applyRerolls(dice, model.reroll, critThreshold, normThreshold, rng, faithRerolls);
  if (faithRerolls) return {...spendFaith(model, dice, faithRerolls, autoCrits, autoNorms,
    shielded, abilities.has(Ability.ObscuredTarget), rng), cursed};

  // Classify final dice (inlined to avoid function call overhead)
  let crits = 0;
  let norms = 0;
  let fails = 0;
  for (let i = 0; i < dice.length; i++) {
    const die = dice[i];
    if (die >= critThreshold) crits++;
    else if (die >= normThreshold) norms++;
    else fails++;
  }

  // Curse failures cannot be retained, including by Blessings of Infection.

  // Apply post-roll modifications (shared with exact engine)
  const trackFightAbilities = model.fightOnceAbilities.length > 0;
  const options = new Map<string, PostRollSuccesses>();
  const recordOption = (result: PostRollSuccesses) =>
    options.set(`${result.crits},${result.norms},${result.usedFightAbilities?.join(',') ?? ''}`, result);
  const score = abilities.has(Ability.BlessingsOfInfection) ? (c: number, n: number, usedFightAbilities?: Ability[]) => {
    recordOption(trackFightAbilities ? {crits: c, norms: n, usedFightAbilities: usedFightAbilities ?? []} : {crits: c, norms: n});
    return c * (model.critDmg + model.mwx) + n * model.normDmg;
  } : undefined;
  const modified = applyPostRollModifications(
    crits, norms, fails,
    autoCrits, autoNorms,
    model.failsToNorms, model.normsToCrits,
    abilities,
    model.normDmg,
    model.critDmg + model.mwx,
    score,
    shielded,
    trackFightAbilities,
  );
  if (score) {
    recordOption(modified);
    return {...modified, cursed, options: [...options.values()]};
  }
  return { ...modified, cursed };
}

function applyRerolls(
  dice: number[],
  reroll: Ability,
  critThreshold: number,
  normThreshold: number,
  rng: RngFunction,
  tracked?: Set<number>,
): void {
  if (reroll === Ability.None) return;
  const rollAgain = (i: number) => {
    tracked?.add(i);
    dice[i] = (rng() * 6 | 0) + 1;
  };

  // Inline comparisons instead of closure allocations
  if (reroll === Ability.RerollOnes) {
    for (let i = 0; i < dice.length; i++) {
      if (dice[i] === 1) rollAgain(i);
    }
  }
  else if (reroll === Ability.Relentless) {
    for (let i = 0; i < dice.length; i++) {
      if (dice[i] < normThreshold) rollAgain(i);
    }
  }
  else if (reroll === Ability.CritFishRelentless) {
    for (let i = 0; i < dice.length; i++) {
      if (dice[i] < critThreshold) rollAgain(i);
    }
  }
  else if (reroll === Ability.Balanced || reroll === Ability.DoubleBalanced) {
    const maxRerolls = reroll === Ability.DoubleBalanced ? 2 : 1;
    let rerolled = 0;
    for (let i = 0; i < dice.length && rerolled < maxRerolls; i++) {
      if (dice[i] < normThreshold) {
        rollAgain(i);
        rerolled++;
      }
    }
  }
  else if (reroll === Ability.RerollMostCommonFail) {
    rerollMostCommonFail(dice, normThreshold, rng, rollAgain);
  }
  else if (reroll === Ability.RerollOnesPlusBalanced) {
    // Step 1: Reroll all 1s, tracking which dice were rerolled via bitmask
    let rerolledMask = 0;
    for (let i = 0; i < dice.length; i++) {
      if (dice[i] === 1) {
        rollAgain(i);
        rerolledMask |= (1 << i);
      }
    }
    // Step 2: Balanced rerolls one fail that was NOT already rerolled by RerollOnes
    for (let i = 0; i < dice.length; i++) {
      if (!(rerolledMask & (1 << i)) && dice[i] < normThreshold) {
        rollAgain(i);
        break;
      }
    }
  }
  else if (reroll === Ability.RerollMostCommonFailPlusBalanced) {
    // Step 1: RerollMostCommonFail, tracking which dice were rerolled
    const rerolledMask = rerollMostCommonFail(dice, normThreshold, rng, rollAgain);
    // Step 2: Balanced rerolls one fail that was NOT already rerolled
    for (let i = 0; i < dice.length; i++) {
      if (!(rerolledMask & (1 << i)) && dice[i] < normThreshold) {
        rollAgain(i);
        break;
      }
    }
  }
}

function rerollMostCommonFail(
  dice: number[],
  normThreshold: number,
  rng: RngFunction,
  rollAgain: (index: number) => void,
): number {
  // Group fail dice by face value using fixed arrays (faces 1-5 max)
  // counts[face] = count, masks[face] = bitmask of indices
  const counts = [0, 0, 0, 0, 0, 0, 0]; // index by face value 0-6
  const masks = [0, 0, 0, 0, 0, 0, 0];
  let hasAnyFail = false;

  for (let i = 0; i < dice.length; i++) {
    if (dice[i] < normThreshold) {
      const face = dice[i];
      counts[face]++;
      masks[face] |= (1 << i);
      hasAnyFail = true;
    }
  }

  if (!hasAnyFail) return 0;

  // Find the most common fail face (break ties randomly)
  let maxCount = 0;
  let numCandidates = 0;
  let chosenFace = 0;
  // candidate faces stored inline
  const candidates = [0, 0, 0, 0, 0, 0];

  for (let face = 1; face <= 6; face++) {
    if (counts[face] > maxCount) {
      maxCount = counts[face];
      numCandidates = 1;
      candidates[0] = face;
    } else if (counts[face] === maxCount && counts[face] > 0) {
      candidates[numCandidates++] = face;
    }
  }

  chosenFace = numCandidates === 1
    ? candidates[0]
    : candidates[Math.floor(rng() * numCandidates)];

  // Reroll all dice showing the chosen face
  let rerolledMask = masks[chosenFace];
  let remaining = rerolledMask;
  while (remaining) {
    const bit = remaining & (-remaining); // lowest set bit
    const idx = 31 - Math.clz32(bit);
    rollAgain(idx);
    remaining ^= bit;
  }

  return rerolledMask;
}
