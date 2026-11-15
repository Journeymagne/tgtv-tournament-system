import Model from "src/Model";
import * as Util from 'src/Util';
import * as Common from 'src/CalcEngineCommon';
import ShootOptions from "src/ShootOptions";
import { maxRelicIgnoresPerBattle } from 'src/SaintlyRelics';
import {
  DamageResult,
  calcDefenderFinalDiceStuff,
  calcPostFnpDamages,
  calcRelicsOutcomes,
  calcScenarioDamage,
  defenceDiceFor,
  hitScorerForDefender,
} from 'src/CalcEngineShootInternal'

type ScenarioVisitor = (result: DamageResult, currProb: number) => void;

export function calcDmgProbs(
  attacker: Model,
  defender: Model,
  shootOptions: ShootOptions = new ShootOptions(),
): Map<number, number> // damage to prob
{
  const defenderStuff = calcDefenderFinalDiceStuff(defender, attacker);
  const attackerFinalDiceProbs = Common.calcFinalDiceProbsForAttacker(
    attacker, defender, hitScorerForDefender(attacker, defender, defenderStuff));
  const usesFnp = defender.usesFnp();
  const usesRelics = defender.usesSaintlyRelics();
  const numRounds = shootOptions.numRounds;

  // visit every attacker-outcome x defender-save-outcome scenario exactly once
  function forEachScenario(visit: ScenarioVisitor): void {
    for (const atk of attackerFinalDiceProbs) {
      if (atk.crits + atk.norms <= 0) {
        continue;
      }
      for (const def of defenceDiceFor(defenderStuff, atk.crits)) {
        const result = calcScenarioDamage(attacker, defender, atk.crits, atk.norms, def);
        visit(result, atk.prob * def.prob);
      }
    }
  }

  // SaintlyRelics across multiple rounds needs the two-dice-per-battle cap, which couples rounds;
  // handle it separately so the cap is enforced exactly rather than ignoring once per round.
  if (usesRelics && numRounds > 1) {
    return calcRelicsMultiRoundDmgProbs(attacker, defender, numRounds, usesFnp, forEachScenario);
  }

  let damageToProb = new Map<number, number>();
  // for FNP: track (damage,numHits) pairs to know how many FNP rolls to make
  const damageHitsToProb = new Map<string, number>();

  function recordDamage(damage: number, numHits: number, prob: number): void {
    if (damage <= 0) {
      return; // damage=0 is filled in later by fillInProbForZero
    }
    if (usesFnp) {
      Util.addToMapValue(damageHitsToProb, `${damage},${numHits}`, prob);
    } else {
      Util.addToMapValue(damageToProb, damage, prob);
    }
  }

  forEachScenario((result, currProb) => {
    if (usesRelics) {
      // SaintlyRelics may ignore one damaging attack dice, splitting this scenario's single
      // damage value into a few weighted possibilities.
      for (const outcome of calcRelicsOutcomes(result, attacker, defender.saintlyRelics)) {
        recordDamage(outcome.damage, outcome.numHits, currProb * outcome.prob);
      }
    } else {
      recordDamage(result.damage, result.numHits, currProb);
    }
  });

  if(usesFnp) {
    damageToProb = calcPostFnpDamages(defender.fnp, damageHitsToProb);
  }

  Util.fillInProbForZero(damageToProb);

  if(numRounds > 1) {
    damageToProb = Common.calcMultiRoundDamage(damageToProb, numRounds);
  }

  return damageToProb;
}

// FNP-resolve (or just collapse) a "damage,numHits"-keyed accumulator into a damage distribution,
// keeping 0-damage entries so the branch's probability mass stays exact for the convolution.
function finalizeHits(
  hits: Map<string, number>,
  fnp: number,
  usesFnp: boolean,
): Map<number, number>
{
  if (usesFnp) {
    return calcPostFnpDamages(fnp, hits, /*skipZeroDamage*/ false);
  }
  const damageToProb = new Map<number, number>();
  for (const [key, prob] of hits) {
    Util.addToMapValue(damageToProb, Number(key.split(',')[0]), prob);
  }
  return damageToProb;
}

// SaintlyRelics over >1 round. Build three single-round distributions — relic unspent (off),
// relic available but no ignore taken (on0), relic available and one ignore taken (on1) — then
// convolve them while enforcing the two-ignores-per-battle cap.
function calcRelicsMultiRoundDmgProbs(
  attacker: Model,
  defender: Model,
  numRounds: number,
  usesFnp: boolean,
  forEachScenario: (visit: ScenarioVisitor) => void,
): Map<number, number>
{
  const offHits = new Map<string, number>();
  const on0Hits = new Map<string, number>();
  const on1Hits = new Map<string, number>();
  let iteratedProb = 0;

  const add = (hits: Map<string, number>, damage: number, numHits: number, prob: number) =>
    Util.addToMapValue(hits, `${damage},${numHits}`, prob);

  forEachScenario((result, currProb) => {
    iteratedProb += currProb;
    // relic unavailable: full damage, no ignore
    add(offHits, result.damage, result.numHits, currProb);
    // relic available: split outcomes by whether the ignore was spent
    for (const outcome of calcRelicsOutcomes(result, attacker, defender.saintlyRelics)) {
      const prob = currProb * outcome.prob;
      add(outcome.ignored ? on1Hits : on0Hits, outcome.damage, outcome.numHits, prob);
    }
  });

  const off = finalizeHits(offHits, defender.fnp, usesFnp);
  const on0 = finalizeHits(on0Hits, defender.fnp, usesFnp);
  const on1 = finalizeHits(on1Hits, defender.fnp, usesFnp);

  // the all-miss attacker outcome (0 hits) is never iterated; it deals 0 damage and uses no
  // ignore, so its mass belongs to the relic-unavailable and no-ignore distributions at damage 0
  const missMass = 1 - iteratedProb;
  if (missMass > 1e-12) {
    Util.addToMapValue(off, 0, missMass);
    Util.addToMapValue(on0, 0, missMass);
  }

  return Common.calcCappedMultiRoundDamage(on0, on1, off, numRounds, maxRelicIgnoresPerBattle);
}