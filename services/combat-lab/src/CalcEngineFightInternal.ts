import Model from "src/Model";
import * as Util from 'src/Util';
import FightStrategy from 'src/FightStrategy';
import FighterState from "src/FighterState";
import FightChoice from "src/FightChoice";
import Ability from "src/Ability";
import { simulateFighterDice, mulberry32 } from "src/MonteCarloFightDice";

const DEFAULT_SEED = 0x4B54_4341; // "KTCA" - deterministic default for stable results

// Lookaheads (strike-vs-parry, strike order, parry-then-kill) resolve throwaway fights to compare
// options, via FighterState.asEstimate(). Estimate clones carry no rng and prevent damage by
// expected value instead of rolling, which is what makes the comparison both safe and stable:
//
//  - they never draw from the live per-round streams, so the real resolution keeps the draws it
//    needs and the Common Random Numbers scheme holds;
//  - they still account for Feel No Pain and Saintly Relics, so an estimate isn't comparing damage
//    the defender would in fact have prevented;
//  - and being deterministic and smooth in their inputs, a decision only flips when the underlying
//    trade-off flips. Rolling against a fixed seed would instead make each estimate a step function
//    of its inputs, which measurably reintroduced the jitter CRN removed (raising a fighter's own
//    crit damage nudged that fighter's own death chance up again).
//
// It stays a heuristic: expected values ignore the spread of prevention outcomes, and Saintly
// Relics is order-sensitive (relicWorthy targets the biggest pending strike).

// Distinct per-simulation RNG streams so a change to one input can't shift the
// draw alignment of unrelated streams. See mixSeed / the sim loop below.
const enum RngStream {
  Guy1Dice = 0,   // guy1's attack dice + rerolls
  Guy2Dice = 1,   // guy2's attack dice + rerolls
  Guy1Defense = 2, // guy1's Feel No Pain / Saintly Relics rolls (damage guy1 takes)
  Guy2Defense = 3, // guy2's Feel No Pain / Saintly Relics rolls (damage guy2 takes)
}

// Mix (seed, simIndex, round, stream) into a well-distributed 32-bit seed. An
// integer avalanche (Murmur-style) so adjacent (sim, round, stream) tuples yield
// decorrelated streams rather than the near-identical sequences raw sequential
// seeds produce. round participates so each round of a multi-round fight draws
// from streams independent of earlier rounds' draw counts (same discipline as the
// per-simulation independence, applied within a simulation).
function mixSeed(seed: number, sim: number, round: number, stream: RngStream): number {
  let h = (seed | 0)
    ^ Math.imul(sim + 1, 0x9E3779B1)
    ^ Math.imul(round + 1, 0x27D4EB2F)
    ^ Math.imul(stream + 1, 0x85EBCA77);
  h = Math.imul(h ^ (h >>> 16), 0x21F0AAAD);
  h = Math.imul(h ^ (h >>> 15), 0x735A2D97);
  h ^= h >>> 15;
  return h | 0;
}

// Numeric composite key: wounds values are small (typically < 100),
// so packing into a single number avoids string allocation/parsing.
const WOUND_KEY_MULTIPLIER = 1000;
export const toWoundPairKey = (guy1Wounds: number, guy2Wounds: number): string =>
  String(guy1Wounds * WOUND_KEY_MULTIPLIER + guy2Wounds);
export const fromWoundPairKey = (woundsPairText: string): number[] => {
  const n = Number(woundsPairText);
  return [(n / WOUND_KEY_MULTIPLIER) | 0, n % WOUND_KEY_MULTIPLIER];
};

// Internal numeric key helpers (avoid string conversion in hot loop)
const toNumericKey = (guy1Wounds: number, guy2Wounds: number): number =>
  guy1Wounds * WOUND_KEY_MULTIPLIER + guy2Wounds;

export function consolidateWoundPairProbs(woundPairProbs: Map<string,number>): [Map<number,number>, Map<number,number>] {
  const guy1WoundProbs = new Map<number,number>();
  const guy2WoundProbs = new Map<number,number>();

  for(let [woundPairText, prob] of woundPairProbs) {
    const n = Number(woundPairText);
    const guy1Wounds = (n / WOUND_KEY_MULTIPLIER) | 0;
    const guy2Wounds = n % WOUND_KEY_MULTIPLIER;
    Util.addToMapValue(guy1WoundProbs, guy1Wounds, prob);
    Util.addToMapValue(guy2WoundProbs, guy2Wounds, prob);
  }

  return [guy1WoundProbs, guy2WoundProbs];
}

// KT2024 Injured: fewer than half its starting wounds remaining worsens the Hit stat by 1.
// A Hit stat can't be worsened past 6+.
export function injuredHitStat(hitStat: number, currentWounds: number, startingWounds: number): number {
  const injured = currentWounds * 2 < startingWounds;
  return injured ? Math.max(hitStat, Math.min(hitStat + 1, 6)) : hitStat;
}

export function calcRemainingWoundPairProbs(
  guy1: Model,
  guy2: Model,
  guy1Strategy: FightStrategy = FightStrategy.MaxDmgToEnemy,
  guy2Strategy: FightStrategy = FightStrategy.MaxDmgToEnemy,
  numRounds: number = 1,
  numSimulations: number = 15_000,
  seed: number = DEFAULT_SEED,
): Map<string, number> // remaining wound-pairs (as stringified array) to probs
{
  if (!Number.isInteger(numSimulations) || numSimulations <= 0) {
    throw new RangeError(`numSimulations must be a positive integer, got ${numSimulations}`);
  }

  // Use numeric keys internally to avoid string allocation in hot loop
  const woundPairCounts = new Map<number, number>();

  // Pre-allocate FighterState objects and reuse across simulations. Their rng is
  // (re)assigned per simulation below to the fighter's own defense stream.
  const guy1State = new FighterState(guy1, 0, 0, guy1Strategy, -1, false, false, null);
  const guy2State = new FighterState(guy2, 0, 0, guy2Strategy, -1, false, false, null);

  const guy1OrigWounds = guy1.wounds;
  const guy2OrigWounds = guy2.wounds;
  const guy1OrigDiceStat = guy1.diceStat;
  const guy2OrigDiceStat = guy2.diceStat;

  for (let sim = 0; sim < numSimulations; sim++) {
    let guy1Wounds = guy1OrigWounds;
    let guy2Wounds = guy2OrigWounds;

    // SaintlyRelics two-per-battle cap resets each battle (simulation), not each round/action
    guy1State.relicIgnoresUsed = 0;
    guy2State.relicIgnoresUsed = 0;

    for (let round = 0; round < numRounds; round++) {
      if (guy1Wounds <= 0 || guy2Wounds <= 0) break;

      // Common Random Numbers: give each (simulation, round) its own independent
      // streams, one per purpose, seeded from (seed, sim, round, stream) instead of
      // threading a single shared stream through the whole run. This is what stops
      // the "change one stat, every unrelated number jitters" artifact: because
      // streams are re-seeded per (sim, round), a change that alters how many rng
      // draws a round consumes can no longer shift the dice of any later round or
      // simulation. And because each stream is seeded independently of the OTHER
      // fighter, two scenarios that differ in a single stat reuse identical dice
      // everywhere the change doesn't reach, so the comparison reflects the real
      // effect rather than resampling noise.
      const guy1DiceRng = mulberry32(mixSeed(seed, sim, round, RngStream.Guy1Dice));
      const guy2DiceRng = mulberry32(mixSeed(seed, sim, round, RngStream.Guy2Dice));
      guy1State.rng = mulberry32(mixSeed(seed, sim, round, RngStream.Guy1Defense));
      guy2State.rng = mulberry32(mixSeed(seed, sim, round, RngStream.Guy2Defense));

      // Temporarily set wounds to avoid cloning Model objects
      guy1.wounds = guy1Wounds;
      guy2.wounds = guy2Wounds;
      // Injured: a fighter that starts this round below half its starting wounds has its
      // weapon's Hit stat worsened by 1. Only a later round can start injured.
      guy1.diceStat = injuredHitStat(guy1OrigDiceStat, guy1Wounds, guy1OrigWounds);
      guy2.diceStat = injuredHitStat(guy2OrigDiceStat, guy2Wounds, guy2OrigWounds);

      const guy1Dice = simulateFighterDice(guy1, guy2, guy1DiceRng);
      const guy2Dice = simulateFighterDice(guy2, guy1, guy2DiceRng);

      // Reset pre-allocated state objects instead of creating new ones. reset()
      // clears per-action flags but preserves each fighter's defense rng stream.
      guy1State.reset(guy1Dice.crits, guy1Dice.norms, guy1Wounds);
      guy2State.reset(guy2Dice.crits, guy2Dice.norms, guy2Wounds);

      // Curse of Rot: each 3 a fighter rolled deals that fighter 1 damage straight after the roll,
      // before any strike. Feel No Pain rolls for each; Saintly Relics can't (not an attack dice).
      for (let i = 0; i < guy1Dice.cursed; i++) guy1State.applyDmg(1, false);
      for (let i = 0; i < guy2Dice.cursed; i++) guy2State.applyDmg(1, false);

      resolveFight(guy1State, guy2State);

      guy1Wounds = guy1State.currentWounds;
      guy2Wounds = guy2State.currentWounds;
    }

    const key = toNumericKey(guy1Wounds, guy2Wounds);
    const prev = woundPairCounts.get(key);
    woundPairCounts.set(key, prev !== undefined ? prev + 1 : 1);
  }

  // Restore original wounds and Hit stats
  guy1.wounds = guy1OrigWounds;
  guy2.wounds = guy2OrigWounds;
  guy1.diceStat = guy1OrigDiceStat;
  guy2.diceStat = guy2OrigDiceStat;

  // Convert numeric counts to string-keyed probabilities
  const woundPairProbs = new Map<string, number>();
  for (const [numKey, count] of woundPairCounts) {
    woundPairProbs.set(String(numKey), count / numSimulations);
  }

  return woundPairProbs;
}

export function resolveFight(
  guy1State: FighterState,
  guy2State: FighterState,
): void
{
  let currentGuy = guy1State;
  let nextGuy = guy2State;

  handleDuelist(guy1State, guy2State);
  handleDuelist(guy2State, guy1State);

  while(currentGuy.crits + currentGuy.norms + nextGuy.crits + nextGuy.norms > 0
    && currentGuy.currentWounds > 0 && nextGuy.currentWounds > 0)
  {
    // used to have a `if(oneGuy out of successes){ oneGuy.applyDmg(otherGuy.totalDmg())); }`
    // but it would be painful to make that handle first-strike and other abilities

    if(currentGuy.crits + currentGuy.norms > 0) {
      const choice = calcDieChoice(currentGuy, nextGuy);
      resolveDieChoice(choice, currentGuy, nextGuy);
    }

    const tmp = currentGuy;
    currentGuy = nextGuy;
    nextGuy = tmp;
  }

  if(guy1State.crits < 0 || guy1State.norms < 0
    || guy2State.crits < 0 || guy2State.norms < 0)
  {
    throw new Error("bug: ended up with negative successes")
  }
}

export function preferredStrikeChoice(chooser: FighterState, enemy: FighterState): FightChoice {
  // Default: strike crit-first. This front-loads our biggest die, which matters when we might
  // not survive to spend every success — better to land the crit than die holding it.
  const critFirst = chooser.nextStrike();

  // Norm-first is only an option when we hold both dice types. Compare it when order can
  // change the damage that actually lands:
  //  - the enemy has no crits, so a normal parry can cancel our normal but not our crit;
  //  - the enemy zeros or halves the first strike (Just a Scratch, Half Damage), so spending
  //    the cheaper die on that penalty can leave the bigger one intact;
  //  - our normal out-damages our crit. Hammerhand's +1 lands on whichever die is first, so
  //    it preserves that gap rather than closing it.
  // An enemy crit does not by itself make crit-first safe: they may parry our crit if we lead
  // with the normal, or kill us before the second strike. The simulation below keeps crit-first
  // unless norm-first is strictly better.
  const normalOutDamagesCrit = chooser.profile.normDmg > chooser.profile.critDmg;
  // Only this fighter's first strike is zeroed or halved; once it has struck, order no longer
  // dodges the penalty, and re-running the simulation at every later strike would compound.
  const firstStrikeIsPunished = !chooser.hasStruck
    && (enemy.profile.has(Ability.JustAScratch) || enemy.profile.has(Ability.HalfDamageFirstStrike));
  if(!(chooser.crits > 0 && chooser.norms > 0
    && (enemy.crits === 0 || firstStrikeIsPunished || normalOutDamagesCrit))) {
    return critFirst;
  }

  // Whether norm-first actually wins depends on what the enemy does: a PARRYING enemy makes
  // norm-first better (parry denied), but a STRIKING enemy in a death-race makes crit-first
  // better (we may die before spending the crit). So decide by simulating the rest of the
  // fight both ways against the enemy's ACTUAL strategy and keeping the better order.
  //
  // The clones are estimates (see asEstimate above): no rng at all, with Feel No Pain and Saintly
  // Relics applied as expected values, so the comparison accounts for damage prevention without
  // consuming Monte Carlo draws the real resolution needs. It remains a heuristic rather than an
  // exact solver: expected values collapse the spread of prevention outcomes, and Saintly Relics is
  // order-sensitive (relicWorthy targets the biggest pending strike). Each branch spends a die
  // before recursing, so total successes strictly decrease and this terminates.
  const simulateFirstStrike = (first: FightChoice): [FighterState, FighterState] => {
    const ch = chooser.asEstimate();
    const en = enemy.asEstimate();
    resolveDieChoice(first, ch, en);
    resolveFight(en, ch); // enemy acts next
    return [ch, en];
  };

  const [critChooser, critEnemy] = simulateFirstStrike(FightChoice.CritStrike);
  const [normChooser, normEnemy] = simulateFirstStrike(FightChoice.NormStrike);

  let normFirstBetter: boolean;
  if(chooser.strategy === FightStrategy.MinDmgToSelf) {
    normFirstBetter = normChooser.currentWounds > critChooser.currentWounds;
  }
  // Strike / MaxDmgToEnemy: leaving the enemy on fewer wounds is better
  else {
    normFirstBetter = normEnemy.currentWounds < critEnemy.currentWounds;
  }

  // Prefer crit-first on ties so behavior only changes when norm-first is strictly better.
  return normFirstBetter ? FightChoice.NormStrike : critFirst;
}

// Pick which die to strike when the decision is "strike". Damage-maximizing strategies defer
// to preferredStrikeChoice (norm-first to deny a normal parry, or to feed a first-strike
// negation such as Just a Scratch its smaller die). Parry does the same when it is forced to
// strike because the enemy has no successes left — including just after it parried the last
// one. It uses the fewer-enemy-wounds comparison, and stays crit-first on a tie. A Shock-forced
// strike while the enemy still has successes stays crit-first for Parry: that shortcut exists
// to land the shocking crit, and the both-orders search is the Strike / Max Dmg / Min Dmg case.
function strategyStrike(chooser: FighterState, enemy: FighterState): FightChoice {
  if(chooser.strategy === FightStrategy.Strike
    || chooser.strategy === FightStrategy.MaxDmgToEnemy
    || chooser.strategy === FightStrategy.MinDmgToSelf
    || (chooser.strategy === FightStrategy.Parry && enemy.crits + enemy.norms === 0)) {
    return preferredStrikeChoice(chooser, enemy);
  }
  return chooser.nextStrike();
}

export function calcDieChoice(chooser: FighterState, enemy: FighterState): FightChoice {
  // note: this function assumes chooser has remaining successes

  // if enemy has no successes, parry would cancel nothing — must strike. Order still matters
  // for first-strike negation (e.g. Just a Scratch zeroes our first strike), so route through
  // strategyStrike rather than hard-coding crit-first.
  if(enemy.crits + enemy.norms === 0) {
    return strategyStrike(chooser, enemy);
  }

  // Brutal leaves no legal parry when we have no crits.
  if(enemy.profile.has(Ability.Brutal) && chooser.crits === 0) {
    return chooser.nextStrike();
  }

  // Check the next strike through the real damage-resolution path: raw damage can
  // look lethal even when Just a Scratch cancels it or first-strike effects reduce it.
  // As with the other lookaheads, clones keep live state/rng untouched and estimate
  // random prevention by its expectation (this is not a guaranteed-kill test).
  // nextDmg() is the raw upper bound, so skip the clones when even that can't kill.
  if(chooser.nextDmg() >= enemy.currentWounds) {
    const struckEnemy = enemy.asEstimate();
    resolveDieChoice(chooser.nextStrike(), chooser.asEstimate(), struckEnemy);
    if(struckEnemy.currentWounds <= 0) {
      return chooser.nextStrike();
    }
  }

  // Shock's first crit strike discards one unresolved enemy normal, or a crit if they have
  // no normals. Force that strike when the discard removes a success they would otherwise
  // keep: no enemy crits (the discard hits a normal) or no enemy normals (the discard hits
  // a crit). A Parry fighter would otherwise keep parrying a crit-only opponent and never
  // land the discard. When we also hold a norm and are maximizing damage against a norms-only
  // enemy, striking the norm first can still be better — the enemy's normal parry can't touch
  // our crit — so strategyStrike defers to preferredStrikeChoice in that mixed-dice case.
  // When the enemy still holds both crits and normals, Shock would only discard a normal, so
  // this shortcut does not override a crit parry.
  if(chooser.profile.has(Ability.Shock) && !chooser.hasCritStruck && chooser.crits > 0
    && (enemy.crits === 0 || enemy.norms === 0)) {
    return strategyStrike(chooser, enemy);
  }

  // if can parry last enemy success and still kill, then that is awesome
  // and we should do that
  const awesomeParry = calcParryForLastEnemySuccessThenKillEnemy(chooser, enemy);
  if(awesomeParry !== null) {
    return awesomeParry;
  }

  if(chooser.strategy === FightStrategy.Strike) {
    return preferredStrikeChoice(chooser, enemy);
  }
  else if(chooser.strategy === FightStrategy.Parry) {
    return wiseParry(chooser, enemy);
  }
  else if(chooser.strategy === FightStrategy.MaxDmgToEnemy
    || chooser.strategy === FightStrategy.MinDmgToSelf)
  {
    // calc dmgs if all strike or all parry; take better option.
    // Every clone is an estimate (see asEstimate above): these throwaway simulations must not
    // consume draws the real per-round streams need, or the actual resolution desynchronizes and
    // the Common Random Numbers scheme breaks — but they must still account for Feel No Pain and
    // Saintly Relics, since a strike-vs-parry estimate that ignores damage prevention can pick the
    // wrong die. Estimate mode gives both, by applying prevention as its expected value.
    const enemyWeStruck = enemy.withStrategy(FightStrategy.Strike).asEstimate();
    const enemyWeParried = enemyWeStruck.clone();

    const chooserWhoStruck = chooser.asEstimate();
    const chooserWhoParried = chooser.asEstimate();
    const strikeChoice = preferredStrikeChoice(chooser, enemy);
    const parryChoice = wiseParry(chooser, enemy);

    resolveDieChoice(strikeChoice, chooserWhoStruck, enemyWeStruck);
    resolveDieChoice(parryChoice, chooserWhoParried, enemyWeParried);

    resolveFight(enemyWeStruck, chooserWhoStruck);
    resolveFight(enemyWeParried, chooserWhoParried);

    let wantStrike = true;

    if(chooser.strategy === FightStrategy.MaxDmgToEnemy) {
      wantStrike = enemyWeStruck.currentWounds <= enemyWeParried.currentWounds;
    }
    // else MinDmgToSelf
    else {
      wantStrike = chooserWhoStruck.currentWounds >= chooserWhoParried.currentWounds;
    }

    if(wantStrike) {
      return strikeChoice;
    }
    else {
      return parryChoice;
    }
  }

  throw new Error('unsupported FightStrategy: ' + chooser.strategy);
}

export function resolveDieChoice(
  choice: FightChoice,
  chooser: FighterState,
  enemy: FighterState,
): void {
  function applyDmgWithFirstStrikeHandling(dmg: number, isNorm: boolean) {
    if(!chooser.hasStruck) {
      if(enemy.profile.abilities.has(Ability.JustAScratch)) {
        dmg = 0;
      } else {
        if(chooser.profile.abilities.has(Ability.Hammerhand2021)) {
          dmg++;
        }
        if(enemy.profile.abilities.has(Ability.HalfDamageFirstStrike)) {
          // Halved and rounded up, but never below 2 and never above the strike itself.
          // A 2 stays 2 (half would be 1). A 0 or 1 is already at or under that floor.
          dmg = dmg <= 2 ? dmg : Math.ceil(dmg / 2);
        }
      }
      chooser.hasStruck = true;
    }
    // JaS (Normals): ignore the first normal strike's damage; cannot ignore crits.
    // Guarded on dmg > 0 so a strike already zeroed by JaS (Crits) doesn't spend it.
    if(isNorm && dmg > 0 && !enemy.normScratchUsed
      && enemy.profile.abilities.has(Ability.JustAScratchNorms)) {
      dmg = 0;
      enemy.normScratchUsed = true;
    }
    // SaintlyRelics targets the highest-damage strike: spend the single ignore now only if no
    // larger strike is still pending from this attacker (otherwise save it). chooser.crits/norms
    // still include the current strike here, so discount it when measuring what remains.
    const pendingCrits = chooser.crits - (isNorm ? 0 : 1);
    let pendingNorms = chooser.norms - (isNorm ? 1 : 0);
    // an unspent JaS (Normals) will scratch one pending normal to 0, so it isn't real pending damage
    if(pendingNorms > 0 && !enemy.normScratchUsed
      && enemy.profile.abilities.has(Ability.JustAScratchNorms)) {
      pendingNorms--;
    }
    let maxPendingDmg = 0;
    if(pendingCrits > 0) {
      maxPendingDmg = Math.max(maxPendingDmg, chooser.profile.critDmg);
    }
    if(pendingNorms > 0) {
      maxPendingDmg = Math.max(maxPendingDmg, chooser.profile.normDmg);
    }
    enemy.applyDmg(dmg, dmg >= maxPendingDmg);
  }

  if(choice === FightChoice.CritStrike) {
    applyDmgWithFirstStrikeHandling(chooser.profile.critDmg, false);
    chooser.crits--;

    if(chooser.profile.has(Ability.Shock) && !chooser.hasCritStruck) {
      // First crit strike discards one unresolved normal, or a crit if there are none.
      if(enemy.norms > 0) {
        enemy.norms--;
      } else if(enemy.crits > 0) {
        enemy.crits--;
      }
    }

    // A dead fighter cannot be struck. The bonus die would not change this round's
    // wounds, but applyDmg still rolls Saintly Relics and can spend a battle ignore.
    if (
      chooser.successes()
      && chooser.profile.has(Ability.MurderousEntrance2021)
      && !chooser.hasCritStruck
      && enemy.currentWounds > 0
    ) {
      if(chooser.crits > 0) {
        applyDmgWithFirstStrikeHandling(chooser.profile.critDmg, false);
        chooser.crits--;
      }
      else {
        applyDmgWithFirstStrikeHandling(chooser.profile.normDmg, true);
        chooser.norms--;
      }
    }

    chooser.hasCritStruck = true;
  }
  else if(choice === FightChoice.NormStrike) {
    applyDmgWithFirstStrikeHandling(chooser.profile.normDmg, true);
    chooser.norms--;
  }
  else if(choice === FightChoice.CritParry) {
    // Dueller: critical parry can cancel additional normal success
    if(chooser.profile.abilities.has(Ability.Dueller)) {
      let numCritsCancelled = 0;

      if(enemy.crits > 0) {
        enemy.crits--;
        numCritsCancelled++;
      }

      enemy.norms = Math.max(0, enemy.norms - 2 + numCritsCancelled);
    }
    else {
      for(let numCancelled = 0; numCancelled < chooser.profile.cancelsPerParry(); numCancelled++) {
        if(enemy.crits > 0) {
          enemy.crits--;
        }
        else if(enemy.norms > 0) {
          enemy.norms--;
        }
      }
    }
    chooser.crits--;
  }
  else if(choice === FightChoice.NormParry) {
    if(enemy.profile.has(Ability.Brutal)) {
      throw new Error("not allowed to do FightChoice.NormParry when enemy has brutal")
    }
    enemy.norms = Math.max(0, enemy.norms - chooser.profile.cancelsPerParry());
    chooser.norms--;
  }
  else {
    throw new Error("invalid DieChoice");
  }
}

export function calcParryForLastEnemySuccessThenKillEnemy(
  chooser: FighterState,
  enemy: FighterState,
): FightChoice | null
{
  // note: this function assumes chooser and enemy have successes

  // reminder: enemy having brutal means chooser can only parry with crits
  if(enemy.profile.has(Ability.Brutal)) {
    if(chooser.crits === 0) {
      return null;
    }
  }

  const enemySuccesses = enemy.crits + enemy.norms;

  // if chooser can parry enemy's remaining success (or successes due to storm shield)
  // AND kill enemy afterwards, then chooser should parry
  let fightChoice: FightChoice | null = null;

  // special case for Dueller
  if(chooser.profile.abilities.has(Ability.Dueller)
    && chooser.crits > 0
    && enemy.crits <= 1
    && enemySuccesses <= 2
  ) {
    fightChoice = FightChoice.CritParry;
  }
  // handle StormShield and normal
  else if(enemy.crits + enemy.norms <= chooser.profile.cancelsPerParry()) {

    if(enemy.crits > 0) {
      if(chooser.crits > 0) {
        fightChoice = FightChoice.CritParry;
      }
      // else chooser has no crits and can not parry the enemy crit
    }
    // else enemy.norms > 0
    else {
      if(chooser.norms > 0 && !enemy.profile.has(Ability.Brutal)) {
        fightChoice = FightChoice.NormParry;
      }
      else {
        fightChoice = FightChoice.CritParry;
      }
    }
  }

  if(fightChoice !== null) {
    // Estimate the chooser's remaining damage by cloning the fighters, applying
    // the parry, then striking out the rest through the real resolution path.
    // This keeps resolveDieChoice the single source of truth for first-strike
    // handling (JaS Crits, JaS Normals, Hammerhand, etc.) instead of
    // re-deriving it here. The clones are estimates (see asEstimate above), so
    // Feel No Pain and Saintly Relics are applied as expected values — the enemy
    // surviving on Feel No Pain is exactly what decides whether this
    // parry-then-kill line works — without consuming draws the real resolution
    // needs.
    //
    // Crit-first (nextStrike) is the default. When both die types remain after
    // the parry, also lead with a normal: Just a Scratch or half-damage on the
    // first strike can hide a kill that only exists if the cheaper die goes
    // first. Either order reaching 0 is enough. One die type means the two
    // orders are the same, so that second pass is skipped.
    const parry = fightChoice;
    const parryThenStrikesKill = (leadWithNorm: boolean): boolean => {
      const chooserClone = chooser.asEstimate();
      const enemyClone = enemy.asEstimate();

      resolveDieChoice(parry, chooserClone, enemyClone);

      // After parrying the enemy's last success the enemy is out of successes,
      // so the chooser simply strikes until the enemy dies or its successes run out.
      let lead = leadWithNorm;
      while(chooserClone.successes() > 0 && enemyClone.currentWounds > 0) {
        const strike = lead ? FightChoice.NormStrike : chooserClone.nextStrike();
        lead = false;
        resolveDieChoice(strike, chooserClone, enemyClone);
      }

      return enemyClone.currentWounds <= 0;
    };

    if(parryThenStrikesKill(false)) {
      return fightChoice;
    }

    const spendsCrit = fightChoice === FightChoice.CritParry;
    const critsAfterParry = chooser.crits - (spendsCrit ? 1 : 0);
    const normsAfterParry = chooser.norms - (spendsCrit ? 0 : 1);
    if(critsAfterParry > 0 && normsAfterParry > 0 && parryThenStrikesKill(true)) {
      return fightChoice;
    }
  }

  return null;
}

export function wiseParry(chooser: FighterState, enemy: FighterState): FightChoice {
  // function is only called when both chooser and enemy have successes

  // use our crits to parry enemy crits; otherwise save our crits
  // for possible strikes once all enemy successes are gone
  if (enemy.crits > 0 && chooser.crits > 0) {
    return FightChoice.CritParry;
  }
  // do a norm parry, but only if there is an enemy norm success to cancel
  else if (chooser.norms > 0 && enemy.norms > 0 && !enemy.profile.has(Ability.Brutal)) {
    return FightChoice.NormParry;
  }
  // this is a CritParry of an enemy norm success
  else if (chooser.crits > 0) {
    return FightChoice.CritParry;
  }
  // remaining scenario is chooser has only norm successes and {enemy has only crit successes or brutal}
  return FightChoice.NormStrike;
}

export function handleDuelist(
  guy1State: FighterState,
  guy2State: FighterState,
): void
{
  if (
    guy1State.hasDuelistParried
    || !guy1State.profile.abilities.has(Ability.Duelist)
    || guy1State.successes() === 0
    || guy2State.successes() === 0
  ) {
    return;
  }

  // A normal success cannot cancel a critical success, and against Brutal it can't parry at all.
  // With no crit of our own and no enemy normal (or a Brutal enemy), NormParry would spend a die
  // and cancel nothing. Return before the once-per-fight flag is set so the free parry stays
  // available.
  if (guy1State.crits === 0 && (guy2State.norms === 0 || guy2State.profile.has(Ability.Brutal))) {
    return;
  }

  // Duelist's free parry happens once per fight. Mark it spent now so re-entrant resolveFight
  // calls (e.g. the lookahead simulations in calcDieChoice / preferredStrikeChoice, which clone
  // mid-fight state) don't grant it a second time and corrupt the estimate.
  guy1State.hasDuelistParried = true;

  // Brutal: only a crit can parry, and the guard above already returned when we have none.
  if(guy2State.profile.has(Ability.Brutal)) {
    resolveDieChoice(FightChoice.CritParry, guy1State, guy2State);
    return;
  }

  let parryChoice: FightChoice;

  if (guy1State.crits && guy2State.crits) {
    parryChoice = FightChoice.CritParry;
  }
  else if (guy1State.norms === 0) {
    parryChoice = FightChoice.CritParry;
  }
  else {
    parryChoice = FightChoice.NormParry;
  }

  resolveDieChoice(parryChoice, guy1State, guy2State);
}
