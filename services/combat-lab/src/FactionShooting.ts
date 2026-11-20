import Ability from 'src/Ability';
import Model from 'src/Model';
import {chooseAutoNorms} from 'src/CalcEngineCommon';
import {FacePool, rolledFacePools} from 'src/FaceDice';
import {chooseFactionRoll, prepareFactionRoll, Retention, retentionKey} from 'src/FactionDice';
import {relicIgnoreProb} from 'src/SaintlyRelics';

export const oncePerTurnShoot = [Ability.Oubliex, Ability.UndauntedExplorers, Ability.IconOfFaith];
const defenceRules = [Ability.SurvivalInstincts, Ability.DominoField, Ability.OmnissiahsImperative,
  Ability.Sturdy, Ability.ScryProtection, Ability.AerialAgility, Ability.Oubliex, Ability.UndauntedExplorers];
export const hasFactionShooting = (a: Model, d: Model) => a.has(Ability.CriticalShot)
  || (a.has(Ability.ActsOfFaith) && a.faithPoints > 0) || (d.has(Ability.ActsOfFaith) && d.faithPoints > 0)
  || defenceRules.some(rule => d.has(rule));

export interface ShotBranch {
  damage: number;
  hits: number;
  prob: number;
  relic: boolean;
  attackerUsed: Ability[];
  defenderUsed: Ability[];
  attackerFaith: number;
  defenderFaith: number;
}
interface Hit { damage: number; critical: boolean; carriedMortal: boolean }
interface Damage {
  damage: number;
  hits: number;
  prob: number;
  relic: boolean;
  used: Ability[];
}
interface Saved {
  outcomes: Damage[];
  value: number;
  used: Ability[];
  criticalShot: boolean;
}

function damageAfterSaves(a: Model, d: Model, crits: number, norms: number,
  originalCrits: number, downgradedCrits: number, relicMode: number): Damage[] {
  const mortal = originalCrits * a.mwx;
  const criticalShot = a.has(Ability.CriticalShot) && crits > 0;
  const result: Damage[] = [];
  for (const bonus of criticalShot ? [1, 2, 3] : [0]) {
    const dice: Hit[] = [
      ...Array.from({length: crits}, (_, i) => ({critical: true, carriedMortal: true, damage: a.critDmg + (i === 0 ? bonus : 0)})),
      ...Array.from({length: norms}, (_, i) => ({critical: false, carriedMortal: i < downgradedCrits, damage: a.normDmg})),
    ].filter(die => die.damage > 0).sort((x, y) => y.damage - x.damage);
    // A lost normal can still have inflicted Devastating before Sturdy downgraded it.
    const used: Ability[] = [];
    if (d.has(Ability.JustAScratchNorms)) {
      const index = dice.findIndex(die => !die.critical);
      if (index >= 0) { dice.splice(index, 1); used.push(Ability.JustAScratchNorms); }
    }
    // Successes resolve simultaneously. Try the biggest eligible hit first.
    // A failed Oubliex/Aerial/Relic roll leaves that ignore available for the next hit.
    interface State { dice: Hit[]; used: Ability[]; prob: number; relic: boolean }
    let states: State[] = [{dice, used, prob: criticalShot ? 1 / 3 : 1, relic: false}];
    const ignore = (prob: number, rule?: Ability) => {
      if (!prob) return;
      states = states.flatMap(state => {
        const rows: State[] = [];
        let remaining = state.prob;
        for (let i = 0; i < state.dice.length; i++) {
          if (rule === Ability.AerialAgility && state.dice[i].critical) continue;
          const kept = state.dice.slice();
          kept.splice(i, 1);
          rows.push({dice: kept, used: rule ? [...state.used, rule] : state.used,
            prob: remaining * prob, relic: state.relic || !rule});
          remaining *= 1 - prob;
        }
        rows.push({...state, prob: remaining});
        return rows;
      });
    };
    if (d.has(Ability.AerialAgility)) ignore(1 / 3, Ability.AerialAgility);
    if (d.has(Ability.Oubliex)) ignore(1 / 3, Ability.Oubliex);
    ignore(relicIgnoreProb(relicMode));
    for (const state of states) {
      let damage = mortal + state.dice.reduce((s, die) => s + die.damage, 0);
      let consumed = state.used;
      if (state.dice.length && d.has(Ability.UndauntedExplorers)) {
        const largest = state.dice[0].damage;
        damage -= Math.max(0, largest - Math.max(2, Math.ceil(largest / 2)));
        consumed = [...consumed, Ability.UndauntedExplorers];
      }
      const survivingMortalHits = state.dice.filter(die => die.carriedMortal).length;
      const hits = state.dice.length + (mortal ? originalCrits - survivingMortalHits : 0);
      result.push({damage, hits, prob: state.prob, relic: state.relic, used: consumed});
    }
  }
  return result;
}

// Enumerate legal blocks before any D3 or ignore is rolled. A single critical
// save can otherwise block either hit, and a pair of normal saves can block a crit.
function bestBlocks(d: Model, atk: Retention, def: Retention,
  after: (c: number, n: number, originalCrits: number, downgradedCrits: number) => Saved): Saved {
  const originalCrits = atk.crits.length;
  const sturdy = d.has(Ability.Sturdy) && originalCrits > 0;
  const critFaces = sturdy ? [] : atk.crits;
  const normFaces = sturdy ? [...atk.norms, ...atk.crits] : atk.norms;
  let best: Saved | undefined;
  function block(c: number, n: number, cs: number, ns: number, nativeNormals: number, used: Ability[]) {
    for (let byCrit = 0; byCrit <= Math.min(cs, c); byCrit++) {
      for (let byPair = 0; byPair <= Math.min(Math.floor(ns / 2), c - byCrit); byPair++) {
        const leftCrit = c - byCrit - byPair;
        const leftNorm = Math.max(0, n - (cs - byCrit) - (ns - 2 * byPair));
        // Equal normal hits can be blocked in either order. Blocking one
        // which has already inflicted Devastating preserves its residual FNP
        // roll; an unblocked downgraded crit still grants only one roll.
        const candidate = after(leftCrit, leftNorm, originalCrits, Math.max(0, leftNorm - nativeNormals));
        if (!best || candidate.value < best.value - 1e-9 ||
          (Math.abs(candidate.value - best.value) < 1e-9 && used.length < best.used.length))
          best = {...candidate, used};
      }
    }
  }
  function considerSurvival(c: number, n: number, cs: number, ns: number, nativeNormals: number, used: Ability[]) {
    block(c, n, cs, ns, nativeNormals, used);
    if (!d.has(Ability.SurvivalInstincts)) return;
    const enhanced = [...used, Ability.SurvivalInstincts];
    if (ns && c) block(c - 1, n, cs, ns - 1, nativeNormals, enhanced);
    if (cs && c + n >= 2) {
      for (let crit = Math.max(0, 2 - n); crit <= Math.min(2, c); crit++)
        block(c - crit, n - (2 - crit), cs - 1, ns, nativeNormals, enhanced);
    }
  }
  const used = sturdy ? [Ability.Sturdy] : [];
  considerSurvival(critFaces.length, normFaces.length, def.crits.length, def.norms.length, atk.norms.length, used);
  if (d.has(Ability.DominoField)) {
    for (const critical of [false, true]) {
      for (const face of new Set(critical ? def.crits : def.norms)) {
        if (!face) continue;
        const c = critFaces.filter(f => f !== face).length, n = normFaces.filter(f => f !== face).length;
        if (c + n === critFaces.length + normFaces.length) continue;
        considerSurvival(c, n, def.crits.length - Number(critical), def.norms.length - Number(!critical),
          atk.norms.filter(f => f !== face).length,
          [...used, Ability.DominoField]);
      }
    }
  }
  return best!;
}

function shootingPools(count: number, model: Model, cursed: boolean, keepFaces: boolean): FacePool[] {
  const pools = rolledFacePools(count, model, cursed, keepFaces);
  if (model.has(Ability.ActsOfFaith) && model.faithPoints > 0) return pools;
  // Only Guidance distinguishes a fresh die from a die already re-rolled.
  const grouped = new Map<string, FacePool>();
  for (const p of pools) {
    const faces = [...p.fresh, ...p.rerolled].sort((x, y) => x - y);
    const key = p.cursed + '/' + faces.join('');
    const prev = grouped.get(key);
    if (prev) prev.prob += p.prob;
    else grouped.set(key, {fresh: faces, rerolled: [], cursed: p.cursed, prob: p.prob});
  }
  return [...grouped.values()];
}

export function factionShotBranches(a: Model, d: Model, relicMode: number): ShotBranch[] {
  const keepFaces = d.has(Ability.DominoField);
  if (d.has(Ability.OmnissiahsImperative))
    d = d.withProp('diceStat', Math.min(d.diceStat, Math.max(2, d.diceStat - 1)));
  const damageCache = new Map<string, Saved>();
  const damage = (c: number, n: number, orig: number, downgraded: number): Saved => {
    const key = [c, n, orig, downgraded].join();
    let row = damageCache.get(key);
    if (!row) {
      const outcomes = damageAfterSaves(a, d, c, n, orig, downgraded, relicMode);
      const fnp = d.usesFnp() ? (7 - d.fnp) / 6 : 0;
      const value = outcomes.reduce((s, o) => s + o.prob * (o.damage - o.hits * fnp), 0);
      row = {outcomes, value, used: [], criticalShot: a.has(Ability.CriticalShot) && c > 0};
      damageCache.set(key, row);
    }
    return row;
  };
  const defenceCache = new Map<number, Array<{choose: ReturnType<typeof prepareFactionRoll>; prob: number; cursed: number}>>();
  const hitsCache = new Map<string, {branches: ShotBranch[]; value: number}>();
  const empty: ShotBranch = {damage: 0, hits: 0, prob: 1, relic: false,
    defenderUsed: [], attackerUsed: [], attackerFaith: 0, defenderFaith: 0};
  function defend(atk: Retention) {
    const hitKey = retentionKey(atk);
    const cached = hitsCache.get(hitKey);
    if (cached) return cached;
    if (!atk.crits.length && !atk.norms.length) return {branches: [empty], value: 0};
    const piercing = Math.max(a.apx, atk.crits.length ? a.px : 0);
    const count = Math.max(0, d.numDice + Number(d.has(Ability.OmnissiahsImperative)) - piercing);
    const autoCrits = Math.min(count, d.autoCrits), autoNorms = Math.min(count - autoCrits, d.autoNorms);
    let pools = defenceCache.get(count);
    if (!pools) {
      const raw = shootingPools(count - autoCrits - autoNorms, d, a.has(Ability.CurseOfRot), keepFaces);
      pools = raw.map(pool => ({prob: pool.prob, cursed: pool.cursed,
        choose: prepareFactionRoll({model: d, autoCrits, autoNorms, defence: true, keepFaces}, pool)}));
      defenceCache.set(count, pools);
    }
    const branches = new Map<string, ShotBranch>();
    const saves = new Map<string,Saved>();
    function saved(def: Retention) {
      const key = retentionKey(def);
      let value = saves.get(key);
      if (!value) { value = bestBlocks(d, atk, def, damage); saves.set(key, value); }
      return value;
    }
    let value = 0;
    for (const pool of pools) {
      const chosen = pool.choose(def => -saved(def).value);
      for (const def of chosen) {
        const s = saved(def.dice);
        const p = pool.prob * def.prob;
        value += p * (s.value + pool.cursed * (d.usesFnp() ? (d.fnp - 1) / 6 : 1));
        for (const out of s.outcomes)
          addBranch(branches, {...empty, damage: out.damage + pool.cursed, hits: out.hits + pool.cursed,
            prob: p * out.prob, relic: out.relic, defenderFaith: def.dice.faith,
            attackerUsed: s.criticalShot ? [Ability.CriticalShot] : [],
            defenderUsed: [...def.dice.used, ...s.used, ...out.used,
              ...(d.has(Ability.OmnissiahsImperative) ? [Ability.OmnissiahsImperative] : [])]});
      }
    }
    const result = {branches: [...branches.values()], value};
    hitsCache.set(hitKey, result);
    return result;
  }
  const autoCrits = Math.min(a.autoCrits, a.numDice);
  const autoNorms = a.autoNorms > 0 ? chooseAutoNorms(a.toAttackerDieProbs(), a.numDice, a.reroll,
    a.autoCrits, a.autoNorms, a.failsToNorms, a.normsToCrits, a.abilities, a.normDmg, a.critDmg + a.mwx,
    d.has(Ability.CurseOfRot) ? a.toCursedAttackerDieProbs() : undefined) : 0;
  const pools = shootingPools(a.numDice - autoCrits - autoNorms, a, d.has(Ability.CurseOfRot), keepFaces);
  const all = new Map<string, ShotBranch>();
  for (const pool of pools) {
    const chosen = chooseFactionRoll({model: a, autoCrits, autoNorms, keepFaces,
      obscured: d.has(Ability.ObscuredTarget)}, pool, atk => defend(atk).value);
    for (const atk of chosen) {
      for (const branch of defend(atk.dice).branches)
        addBranch(all, {...branch, attackerUsed: [...atk.dice.used, ...branch.attackerUsed], attackerFaith: atk.dice.faith,
          prob: pool.prob * atk.prob * branch.prob});
    }
  }
  return [...all.values()];
}

function addBranch(combined: Map<string, ShotBranch>, b: ShotBranch): void {
  const key = [b.damage, b.hits, +b.relic, b.attackerFaith, b.defenderFaith,
    b.attackerUsed.join(','), b.defenderUsed.join(',')].join('|');
  const prev = combined.get(key);
  if (prev) prev.prob += b.prob;
  else combined.set(key, b);
}
