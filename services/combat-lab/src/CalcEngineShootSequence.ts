import Ability from 'src/Ability';
import Model from 'src/Model';
import { calcFinalDiceProbsForAttacker } from 'src/CalcEngineCommon';
import {
  calcDefenderFinalDiceStuff, calcPostFnpDamages, calcRelicsOutcomes,
  calcScenarioDamage, defenceDiceFor, hitScorerForDefender,
} from 'src/CalcEngineShootInternal';
import { attackerForShoot, attackerFrequencyAbilities, defenderFrequencyAbilities, hasScopedWeaponRule, passiveShootAbilities } from 'src/ShootEffectFrequency';
import { maxRelicIgnoresPerBattle } from 'src/SaintlyRelics';
import { addToMapValue } from 'src/Util';
import {factionShotBranches, hasFactionShooting, oncePerTurnShoot} from 'src/FactionShooting';

interface LimitedEffect { ability: Ability; side: 'attacker' | 'defender'; bit: number }
type DamageDistribution = Map<number, number>;
type States = Map<string, DamageDistribution>;

export function hasLimitedShootEffects(attacker: Model, defender: Model): boolean {
  return hasScopedWeaponRule(attacker)
    || attacker.shootOnceAbilities.some(ability => attacker.has(ability) && attackerFrequencyAbilities.includes(ability))
    || defender.shootOnceAbilities.some(ability => defender.has(ability) && defenderFrequencyAbilities.includes(ability));
}

// Exact dynamic program: each probability branch retains its own spent effects and relic cap.
// A no-trigger shot keeps the effect available. All existing one-shot decisions still use the
// current shot's scorer; choosing to save an effect for a future shot is not modeled.
export function calcLimitedShootSequence(attacker: Model, defender: Model, rounds: number): DamageDistribution {
  const effects: LimitedEffect[] = [];
  for (const [side, model, allowed] of [
    ['attacker', attacker, attackerFrequencyAbilities],
    ['defender', defender, defenderFrequencyAbilities],
  ] as const) {
    const intrinsic = side === 'attacker' ? [Ability.IconOfFaith] : oncePerTurnShoot;
    for (const ability of new Set([...model.shootOnceAbilities, ...intrinsic])) {
      if (model.has(ability) && (allowed.includes(ability) || intrinsic.includes(ability)))
        effects.push({side, ability, bit: 1 << effects.length});
    }
  }
  const transitions = new Map<string, States>();
  const scoped = hasScopedWeaponRule(attacker);
  const fnpDistributions = new Map<string, DamageDistribution>();

  function profile(model: Model, side: LimitedEffect['side'], spent: number): Model {
    const copy = model.withProp('abilities', new Set(model.abilities));
    for (const effect of effects)
      if (effect.side === side && (spent & effect.bit)) copy.abilities.delete(effect.ability);
    return copy;
  }

  function usedMask(side: LimitedEffect['side'], used: readonly Ability[] = []): number {
    let mask = 0;
    for (const effect of effects)
      if (effect.side === side && used.includes(effect.ability)) mask |= effect.bit;
    return mask;
  }

  function getTransitions(state: string, round: number): States {
    const cacheKey = `${state}/${scoped ? Math.min(round, 3) : 0}`;
    const cached = transitions.get(cacheKey);
    if (cached) return cached;
    const [spent, relicUsed, attackFaith, defenceFaith] = state.split('/').map(Number);
    const a = attackerForShoot(profile(attacker, 'attacker', spent), round);
    const d = profile(defender, 'defender', spent);
    a.faithPoints -= attackFaith;
    d.faithPoints -= defenceFaith;
    let passiveMask = spent;
    for (const effect of effects)
      if (passiveShootAbilities.includes(effect.ability)) passiveMask |= effect.bit;
    const next: States = new Map();

    function record(mask: number, ignores: number, damage: number, hits: number, prob: number,
      attackCost = 0, defenceCost = 0) {
      const key = [mask, ignores, attackFaith + attackCost, defenceFaith + defenceCost].join('/');
      let damageMap = next.get(key);
      if (!damageMap) { damageMap = new Map(); next.set(key, damageMap); }
      if (!d.usesFnp()) { addToMapValue(damageMap, damage, prob); return; }
      const fnpKey = `${damage},${hits}`;
      let postFnp = fnpDistributions.get(fnpKey);
      if (!postFnp) {
        postFnp = calcPostFnpDamages(d.fnp, new Map([[fnpKey, 1]]), false);
        fnpDistributions.set(fnpKey, postFnp);
      }
      for (const [value, chance] of postFnp) addToMapValue(damageMap, value, prob * chance);
    }

    if (hasFactionShooting(a, d)) {
      const relicMode = relicUsed < maxRelicIgnoresPerBattle ? d.saintlyRelics : 0;
      for (const b of factionShotBranches(a, d, relicMode)) {
        const mask = passiveMask | usedMask('attacker', b.attackerUsed) | usedMask('defender', b.defenderUsed);
        record(mask, relicUsed + Number(b.relic), b.damage, b.hits, b.prob, b.attackerFaith, b.defenderFaith);
      }
      transitions.set(cacheKey, next);
      return next;
    }
    const defence = calcDefenderFinalDiceStuff(d, a, true);
    const attacks = calcFinalDiceProbsForAttacker(a, d, hitScorerForDefender(a, d, defence), true);
    for (const atk of attacks) {
      const attackMask = passiveMask | usedMask('attacker', atk.usedAbilities);
      // Match ordinary Shoot: no successful hits means no defence roll or save-rule usage.
      if (atk.successes() === 0) { record(attackMask, relicUsed, 0, 0, atk.prob); continue; }
      for (const def of defenceDiceFor(defence, atk.crits)) {
        const result = calcScenarioDamage(a, d, atk.crits, atk.norms, def);
        const mask = attackMask | usedMask('defender', def.usedAbilities) | usedMask('defender', result.usedAbilities);
        const relicMode = relicUsed < maxRelicIgnoresPerBattle ? d.saintlyRelics : 0;
        for (const outcome of calcRelicsOutcomes(result, a, relicMode))
          record(mask, relicUsed + Number(outcome.ignored), outcome.damage, outcome.numHits,
            atk.prob * def.prob * outcome.prob);
      }
    }
    transitions.set(cacheKey, next);
    return next;
  }

  let states: States = new Map([['0/0/0/0', new Map([[0, 1]])]]);
  for (let round = 0; round < rounds; round++) {
    const next: States = new Map();
    for (const [state, accumulated] of states) {
      for (const [target, shot] of getTransitions(state, round + 1)) {
        let targetMap = next.get(target);
        if (!targetMap) { targetMap = new Map(); next.set(target, targetMap); }
        for (const [damage, chance] of accumulated)
          for (const [more, conditional] of shot)
            addToMapValue(targetMap, damage + more, chance * conditional);
      }
    }
    states = next;
  }
  const combined: DamageDistribution = new Map();
  for (const damageMap of states.values())
    for (const [damage, chance] of damageMap) addToMapValue(combined, damage, chance);
  return combined;
}
