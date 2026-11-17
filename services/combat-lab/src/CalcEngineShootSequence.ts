import Ability from 'src/Ability';
import Model from 'src/Model';
import { calcFinalDiceProbsForAttacker } from 'src/CalcEngineCommon';
import {
  calcDefenderFinalDiceStuff, calcPostFnpDamages, calcRelicsOutcomes,
  calcScenarioDamage, defenceDiceFor, hitScorerForDefender,
} from 'src/CalcEngineShootInternal';
import { attackerFrequencyAbilities, defenderFrequencyAbilities, passiveShootAbilities } from 'src/ShootEffectFrequency';
import { maxRelicIgnoresPerBattle } from 'src/SaintlyRelics';
import { addToMapValue } from 'src/Util';

interface LimitedEffect { ability: Ability; side: 'attacker' | 'defender'; bit: number }
// State keys pack the spent-effects bitmask together with 0/1/2 relic ignores used.
const relicStates = maxRelicIgnoresPerBattle + 1;
type DamageDistribution = Map<number, number>;
type States = Map<number, DamageDistribution>;

export function hasLimitedShootEffects(attacker: Model, defender: Model): boolean {
  return attacker.shootOnceAbilities.some(ability => attacker.has(ability) && attackerFrequencyAbilities.includes(ability))
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
    for (const ability of new Set(model.shootOnceAbilities)) {
      if (model.has(ability) && allowed.includes(ability))
        effects.push({side, ability, bit: 1 << effects.length});
    }
  }
  const transitions = new Map<number, States>();
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

  function getTransitions(state: number): States {
    const cached = transitions.get(state);
    if (cached) return cached;
    const spent = Math.floor(state / relicStates);
    const relicUsed = state % relicStates;
    const a = profile(attacker, 'attacker', spent), d = profile(defender, 'defender', spent);
    const defence = calcDefenderFinalDiceStuff(d, a, true);
    const attacks = calcFinalDiceProbsForAttacker(a, d, hitScorerForDefender(a, d, defence), true);
    let passiveMask = spent;
    for (const effect of effects)
      if (passiveShootAbilities.includes(effect.ability)) passiveMask |= effect.bit;
    const next: States = new Map();

    function record(mask: number, ignores: number, damage: number, hits: number, prob: number) {
      const key = mask * relicStates + ignores;
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
    transitions.set(state, next);
    return next;
  }

  let states: States = new Map([[0, new Map([[0, 1]])]]);
  for (let round = 0; round < rounds; round++) {
    const next: States = new Map();
    for (const [state, accumulated] of states) {
      for (const [target, shot] of getTransitions(state)) {
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
