import Model from "src/Model";
import * as Util from 'src/Util';
import FinalDiceProb from 'src/FinalDiceProb';
import * as Common from 'src/CalcEngineCommon';
import Ability from "src/Ability";
import { relicIgnoreProb } from "src/SaintlyRelics";

class DefenderFinalDiceStuff {
  public finalDiceProbs: FinalDiceProb[];
  public finalDiceProbsWithPx: FinalDiceProb[];
  public pxIsRelevant: boolean;

  public constructor(
    finalDiceProbs: FinalDiceProb[],
    finalDiceProbsWithPx: FinalDiceProb[],
    pxIsRelevant: boolean,
  )
  {
    this.finalDiceProbs = finalDiceProbs;
    this.finalDiceProbsWithPx = finalDiceProbsWithPx;
    this.pxIsRelevant = pxIsRelevant;
  }
}

export function calcDefenderFinalDiceStuff(
  defender: Model,
  attacker: Model,
): DefenderFinalDiceStuff
{
  const defenderSingleDieProbs = defender.toDefenderDieProbs();
  // Curse of Rot on the attacker: the defender's 3s fail, can't be re-rolled, and each deals 1 damage
  const defenderCursedDieProbs = attacker.has(Ability.CurseOfRot)
    ? defender.toCursedDefenderDieProbs()
    : undefined;

  const numDefDiceWithoutPx = Math.max(0, defender.numDice - attacker.apx);

  // ObscuredTarget is a defender-side flag that modifies the attacker's dice
  // (calcFinalDiceProbsForAttacker merges it into the attacker's ability set).
  // It must not be applied to the defender's own save dice, where the shared
  // applyPostRollModifications would discard save successes.
  const defenderAbilitiesForSaves = new Set(defender.abilities);
  defenderAbilitiesForSaves.delete(Ability.ObscuredTarget);

  const defenderFinalDiceProbs = Common.calcFinalDiceProbs(
    defenderSingleDieProbs,
    numDefDiceWithoutPx,
    defender.reroll,
    defender.autoCrits,
    defender.autoNorms,
    defender.failsToNorms,
    defender.normsToCrits,
    defenderAbilitiesForSaves,
    0,
    0,
    undefined,
    defenderCursedDieProbs,
    );

  let defenderFinalDiceProbsWithPx: FinalDiceProb[] = [];

  // if APx > Px, then ignore Px
  const effectivePx = attacker.apx >= attacker.px ? 0 : attacker.px;
  const pxIsRelevant = effectivePx > 0;

  // for Px triggered and relevant
  if (pxIsRelevant) {
    const numDefDiceWithPx = Math.max(0, defender.numDice - effectivePx);

    defenderFinalDiceProbsWithPx = Common.calcFinalDiceProbs(
      defenderSingleDieProbs,
      numDefDiceWithPx,
      defender.reroll,
      defender.autoCrits,
      defender.autoNorms,
      defender.failsToNorms,
      defender.normsToCrits,
      defenderAbilitiesForSaves,
      0,
      0,
      undefined,
      defenderCursedDieProbs,
    );
  }

  return new DefenderFinalDiceStuff(
    defenderFinalDiceProbs,
    defenderFinalDiceProbsWithPx,
    pxIsRelevant,
  );
}

// The defence-dice distribution a hit profile faces: Piercing Crits only applies when a crit
// was retained.
export function defenceDiceFor(stuff: DefenderFinalDiceStuff, crits: number): FinalDiceProb[] {
  return (stuff.pxIsRelevant && crits > 0) ? stuff.finalDiceProbsWithPx : stuff.finalDiceProbs;
}

// Expected damage of one already-retained hit profile against this defender.
// Cover and both Piercing rules come from the same defence-dice distributions the
// shot uses afterwards, so a retain choice ranked with this scorer is ranking the
// damage that choice will actually deal. Feel No Pain stays out: calcDamage is
// pre-FNP, and the retain step still does not weigh the shape of those rolls.
// Saintly Relics are likewise left out. Pass the shot's own defence-dice stuff to
// avoid building those distributions twice.
export function hitScorerForDefender(
  attacker: Model,
  defender: Model,
  stuff: DefenderFinalDiceStuff = calcDefenderFinalDiceStuff(defender, attacker),
): (crits: number, norms: number) => number {
  const cache = new Map<string, number>();
  return (crits, norms) => {
    const key = `${crits},${norms}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    let total = 0;
    if (crits + norms > 0) {
      for (const def of defenceDiceFor(stuff, crits)) {
        total += def.prob * calcScenarioDamage(attacker, defender, crits, norms, def).damage;
      }
    }
    cache.set(key, total);
    return total;
  };
}

export function calcPostFnpDamages(
  fnp: number,
  preFnpDmgs: Map<string,number>, // key = "damage,numHits"
  skipZeroDamage: boolean = true,
): Map<number,number>
{
  const postFnpDmgs = new Map<number,number>();
  const probFnpSuccess = (7 - fnp) / 6; // prob of passing FNP roll (reducing 1 dmg)

  preFnpDmgs.forEach((prob, key) => {
    const [damage, numHits] = key.split(',').map(Number);
    // roll FNP once per surviving hit; each success subtracts 1 damage; clamp at 0
    for(let successes = 0; successes <= numHits; successes++) {
      const postFnpDmg = Math.max(0, damage - successes);
      if(skipZeroDamage && postFnpDmg <= 0) continue;
      const fnpProb = Util.binomialPmf(numHits, successes, probFnpSuccess);
      Util.addToMapValue(postFnpDmgs, postFnpDmg, prob * fnpProb);
    }
  });

  return postFnpDmgs;
}


export interface DamageResult {
  damage: number;
  numHits: number; // damage-causing hits / FNP-relevant hit instances; includes cancelled crits when MWx contributed damage
  survivingCritHits: number; // crit hits left after saves (each dealing critDmg); SaintlyRelics targets these
  survivingNormHits: number; // norm hits left after saves (each dealing normDmg); SaintlyRelics targets these
}

// One post-SaintlyRelics damage possibility for a single attack/defense scenario.
export interface DamageOutcome {
  damage: number;
  numHits: number;
  prob: number; // conditional probability within the scenario (sums to 1 across outcomes)
  ignored: boolean; // whether this outcome spent the relic to ignore an attack dice
}

// Damage for one attack-dice outcome against one defence-dice outcome, including the 1 damage
// per defence-dice 3 that Curse of Rot inflicts. Those are separate 1-damage instances: each gets
// its own Feel No Pain roll, and Saintly Relics can't ignore them (they aren't attack dice).
export function calcScenarioDamage(
  attacker: Model,
  defender: Model,
  critHits: number,
  normHits: number,
  def: FinalDiceProb,
): DamageResult {
  const result = calcDamage(attacker, defender, critHits, normHits, def.crits, def.norms);
  if (def.cursed <= 0) {
    return result;
  }
  return { ...result, damage: result.damage + def.cursed, numHits: result.numHits + def.cursed };
}

export function calcDamage(
  attacker: Model,
  defender: Model,
  critHits: number,
  normHits: number,
  critSaves: number,
  normSaves: number,
): DamageResult {
  const originalCritHits = critHits;
  const mwxDamage = critHits * attacker.mwx;
  const resolve = (crits: number, norms: number) =>
    calcDamageAfterJas(attacker, defender, originalCritHits, mwxDamage, crits, norms, critSaves, normSaves);

  // Just a Scratch cancels one hit before saves. Which one is best depends on what the saves can
  // then block, so try each hit type and keep the lowest damage. On equal damage,
  // prefer cancelling the type with more per-die damage (crits on a tie). MWx was already counted
  // from the original crits, so cancelling a crit only ever removes critDmg.
  if (defender.has(Ability.JustAScratch) && critHits + normHits > 0) {
    const options: DamageResult[] = [];
    if (critHits > 0) options.push(resolve(critHits - 1, normHits));
    if (normHits > 0) options.push(resolve(critHits, normHits - 1));
    if (attacker.critDmg < attacker.normDmg) options.reverse();
    return options.reduce((best, r) => (r.damage < best.damage ? r : best));
  }
  return resolve(critHits, normHits);
}

function calcDamageAfterJas(
  attacker: Model,
  defender: Model,
  originalCritHits: number,
  mwxDamage: number,
  critHits: number,
  normHits: number,
  critSaves: number,
  normSaves: number,
): DamageResult {
  const numNormalSavesToCancelCritHit = 2; // for Kill Team rules, not Fire Team rules

  function critSavesCancelCritHits() {
    const numCancels = Math.min(critSaves, critHits);
    critSaves -= numCancels;
    critHits -= numCancels;
  }
  function critSavesCancelNormHits() {
    const numCancels = Math.min(critSaves, normHits);
    critSaves -= numCancels;
    normHits -= numCancels;
  }
  function normSavesCancelNormHits() {
    const numCancels = Math.min(normSaves, normHits);
    normSaves -= numCancels;
    normHits -= numCancels;
  }
  function normSavesCancelCritHits() {
    const numCancels = Math.min((normSaves / numNormalSavesToCancelCritHit) >> 0, critHits);
    normSaves -= numCancels * numNormalSavesToCancelCritHit;
    critHits -= numCancels;
  }

  if (defender.has(Ability.JustAScratchNorms)) {
    if (normHits > 0) {
      normHits--;
    }
  }

  if (attacker.critDmg >= attacker.normDmg) {
    critSavesCancelCritHits();
    critSavesCancelNormHits();

    if (attacker.critDmg > 2 * attacker.normDmg) {
      normSavesCancelCritHits();
      normSavesCancelNormHits();
    }
    else {
      // with norm saves, you prefer to cancel norm hits, but you want to avoid
      // cancelling all norm hits and being left over with >=1 crit hit and 1 normal save;
      // in that case, you should have cancelled 1 crit hit before cancelling norm hits;
      if (normSaves > normHits && normSaves >= numNormalSavesToCancelCritHit && critHits > 0) {
        normSaves -= numNormalSavesToCancelCritHit;
        critHits--;
      }

      normSavesCancelNormHits();
      normSavesCancelCritHits();
    }
  }
  else {
    normSavesCancelNormHits();
    critSavesCancelNormHits();
    critSavesCancelCritHits();
    normSavesCancelCritHits();
  }

  return damageFromSurvivors(critHits, normHits);

  function damageFromSurvivors(critHits: number, normHits: number): DamageResult {
    // Only damaging hits get FNP rolls; zero-damage hits must not reduce other hits.
    // Cancelled crits still count if MWx contributed damage.
    const mwxCancelledCrits = attacker.mwx > 0 ? (originalCritHits - critHits) : 0;
    const damagingCrits = attacker.critDmg + attacker.mwx > 0 ? critHits : 0;
    const damagingNorms = attacker.normDmg > 0 ? normHits : 0;
    const numHits = damagingCrits + damagingNorms + mwxCancelledCrits;
    const damage = mwxDamage + critHits * attacker.critDmg + normHits * attacker.normDmg;
    return { damage, numHits, survivingCritHits: critHits, survivingNormHits: normHits };
  }
}

// SaintlyRelics: whenever an attack dice would inflict damage, the defender may roll to ignore
// that dice's damage entirely (1 D6 normal, 2 D6 inspiring; ignore on any 6), at most one dice
// per action. Optimal play targets the highest-damage surviving hit (crits before norms) and,
// because a failed roll doesn't consume the once-per-action cap, keeps trying on the next
// damaging dice until one is ignored. This expands a scenario's single damage value into a small
// distribution over "ignored the biggest hit", "ignored the next-biggest", ..., and "ignored
// nothing". MWx (mortal) damage is not ignored here, matching Just a Scratch.
export function calcRelicsOutcomes(
  result: DamageResult,
  attacker: Model,
  mode: number,
): DamageOutcome[] {
  // ignoreProb is 0 for off/unknown modes; the general loop below then produces no ignore
  // outcomes and returns the single unchanged outcome, so no separate off-branch is needed.
  const ignoreProb = relicIgnoreProb(mode);
  const missProb = 1 - ignoreProb; // one attempt failing to ignore

  // Damaging-dice groups, biggest per-die damage first (the order a player would target them).
  // A crit also carries MWx (mortal) damage, which relics does NOT ignore; when present, the
  // ignored crit still deals that residual damage, so it must keep its Feel No Pain roll.
  const groups: { count: number; dieDmg: number; keepsFnpRoll: boolean }[] = [];
  if (result.survivingCritHits > 0 && attacker.critDmg > 0) {
    groups.push({ count: result.survivingCritHits, dieDmg: attacker.critDmg, keepsFnpRoll: attacker.mwx > 0 });
  }
  if (result.survivingNormHits > 0 && attacker.normDmg > 0) {
    groups.push({ count: result.survivingNormHits, dieDmg: attacker.normDmg, keepsFnpRoll: false });
  }
  groups.sort((a, b) => b.dieDmg - a.dieDmg);

  const outcomes: DamageOutcome[] = [];
  let reachProb = 1; // probability no earlier (bigger) group already used up the once-per-action ignore
  for (const group of groups) {
    const stayProb = Math.pow(missProb, group.count); // every roll in this group fails to ignore
    // ignore lands in this group iff every bigger group missed and at least one of this group's rolls hits
    const ignoreInGroupProb = reachProb * (1 - stayProb);
    if (ignoreInGroupProb > 0) {
      outcomes.push({
        damage: Math.max(0, result.damage - group.dieDmg),
        // drop this hit's FNP roll only if its whole damage is gone; a crit's residual MWx keeps it
        numHits: group.keepsFnpRoll ? result.numHits : Math.max(0, result.numHits - 1),
        prob: ignoreInGroupProb,
        ignored: true,
      });
    }
    reachProb *= stayProb;
  }
  if (reachProb > 0) {
    outcomes.push({ damage: result.damage, numHits: result.numHits, prob: reachProb, ignored: false });
  }
  return outcomes;
}
