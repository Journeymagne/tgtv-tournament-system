import Ability from 'src/Ability';
import FightChoice from 'src/FightChoice';
import FightStrategy from 'src/FightStrategy';
import FighterState from 'src/FighterState';

export type FightPhase = 'turn' | 'any' | 'strike' | 'death';
export interface FightMove {
  choice: FightChoice;
  blockCrits?: number;
  blockNorms?: number;
  enhanced?: boolean;
  bonus?: boolean;
}
type Outcome = [number, number];
interface Decision { move?: FightMove; wounds: Outcome }
const modernRules = [Ability.Dueller, Ability.StrikeOnDeath, Ability.CegorachsJest,
  Ability.DoubleBlock, Ability.BlessingsOfInfection, Ability.CritDamageBonus,
  Ability.FirstStrikeBonus, Ability.StealthAssault, Ability.TiltingShields];
export const usesModernFight = (a: FighterState, b: FighterState) =>
  a.profile.mwx > 0 || b.profile.mwx > 0
  || modernRules.some(rule => a.profile.has(rule) || b.profile.has(rule));
const isStrike = (m: FightMove) => m.choice === FightChoice.CritStrike || m.choice === FightChoice.NormStrike;
const isCrit = (m: FightMove) => m.choice === FightChoice.CritStrike || m.choice === FightChoice.CritParry;

export function legalFightMoves(a: FighterState, b: FighterState, phase: FightPhase = 'turn', ignoreBrutal = false): FightMove[] {
  const moves: FightMove[] = [];
  if (a.crits > 0) {
    if (a.profile.has(Ability.CritDamageBonus) && !a.critBonusUsed)
      moves.push({choice: FightChoice.CritStrike, bonus: true});
    moves.push({choice: FightChoice.CritStrike});
  }
  if (a.norms > 0) moves.push({choice: FightChoice.NormStrike});
  if (phase === 'strike' || phase === 'death') return moves;
  const addBlocks = (critical: boolean, enhanced: boolean) => {
    const count = critical && enhanced ? 2 : 1;
    const canBlockCrit = critical || enhanced || a.profile.has(Ability.Dueller);
    for (let c = Math.min(b.crits, canBlockCrit ? count : 0); c >= 0; c--) {
      const n = Math.min(b.norms, count - c);
      if (c + n === 0 || (enhanced && critical && c + n < 2)) continue;
      if (enhanced && !critical && (c === 0 || a.profile.has(Ability.Dueller))) continue;
      moves.push({choice: critical ? FightChoice.CritParry : FightChoice.NormParry,
        blockCrits: c, blockNorms: n, enhanced});
    }
  };
  const enhanced = a.profile.has(Ability.DoubleBlock) && !a.doubleBlockUsed;
  if (a.crits > 0) { addBlocks(true, false); if (enhanced) addBlocks(true, true); }
  if (a.norms > 0 && (ignoreBrutal || !b.profile.has(Ability.Brutal))) {
    addBlocks(false, false); if (enhanced) addBlocks(false, true);
  }
  return moves;
}

// Resolve exactly one die. Both the planner and the live fight use this path.
function applyDie(a: FighterState, b: FighterState, move: FightMove, phase: FightPhase): FightPhase | null {
  const critical = isCrit(move);
  const strike = isStrike(move);
  const extra = phase === 'turn' && a.successes() > 1
    ? (a.profile.has(Ability.StealthAssault) && !a.hasResolvedDie ? 'any'
      : strike && a.hasFollowUpStrike(critical) ? 'strike' : null)
    : null;
  a.hasResolvedDie = true;
  if (phase === 'death') a.deathStrikeUsed = true;
  if (critical) a.crits--; else a.norms--;
  if (!strike) {
    b.crits -= move.blockCrits ?? 0;
    b.norms -= move.blockNorms ?? 0;
    if (move.enhanced) a.doubleBlockUsed = true;
    return extra;
  }
  let damage = critical ? a.profile.critDmg : a.profile.normDmg;
  if (move.bonus) { damage++; a.critBonusUsed = true; }
  if (!a.hasStruck) {
    if (a.profile.has(Ability.FirstStrikeBonus)) damage++;
    if (b.profile.has(Ability.JustAScratch)) damage = 0;
    else if (b.profile.has(Ability.HalfDamageFirstStrike) && damage > 2) damage = Math.ceil(damage / 2);
  }
  if (!critical && damage > 0 && b.profile.has(Ability.JustAScratchNorms) && !b.normScratchUsed) {
    damage = 0;
    b.normScratchUsed = true;
  }
  let pending = a.crits > 0 ? a.profile.critDmg + (a.profile.has(Ability.CritDamageBonus) && !a.critBonusUsed ? 1 : 0) : 0;
  if (a.norms > 0 && !(b.profile.has(Ability.JustAScratchNorms) && !b.normScratchUsed))
    pending = Math.max(pending, a.profile.normDmg);
  b.applyDmg(damage, damage >= pending);
  if (critical && !a.hasCritStruck && a.profile.has(Ability.Shock)) {
    if (b.norms > 0) b.norms--; else if (b.crits > 0) b.crits--;
  }
  a.hasStruck = true;
  if (critical) a.hasCritStruck = true;
  return extra;
}
export { applyDie as resolveSingleFightDie };

const canDeathStrike = (dead: FighterState, enemy: FighterState) => dead.currentWounds <= 0
  && enemy.currentWounds > 0 && !dead.deathStrikeUsed && dead.successes() > 0
  && dead.profile.has(Ability.StrikeOnDeath);
const jestChance = (a: FighterState, b: FighterState, move: FightMove) =>
  move.choice === FightChoice.NormStrike && b.profile.has(Ability.CegorachsJest) && !b.jestUsed
    ? Math.max(0, Math.min(5, a.profile.diceStat - 1)) / 6 : 0;

function stateKey(a: FighterState): string {
  return [a.crits, a.norms, a.currentWounds, a.strategy, +a.hasStruck, +a.hasCritStruck,
    +a.hasResolvedDie, +a.doubleBlockUsed, +a.critBonusUsed, +a.jestUsed, +a.deathStrikeUsed,
    +a.normScratchUsed, +a.relicUsed, a.relicIgnoresUsed, a.estimateRelicAvailProb].join(',');
}
const signature = (a: FighterState) => [a.profile.normDmg, a.profile.critDmg, a.profile.diceStat,
  a.profile.fnp, a.profile.saintlyRelics, ...Array.from(a.profile.abilities).sort()].join(',');
const swap = (v: Outcome): Outcome => [v[1], v[0]];
export function betterFightOutcome(next: Outcome, best: Outcome, strategy: FightStrategy): boolean {
  const ownFirst = strategy === FightStrategy.MinDmgToSelf || strategy === FightStrategy.Parry;
  const primary = ownFirst ? next[0] - best[0] : best[1] - next[1];
  const secondary = ownFirst ? best[1] - next[1] : next[0] - best[0];
  return primary > 1e-9 || (Math.abs(primary) < 1e-9 && secondary > 1e-9);
}
const better = betterFightOutcome;

class Planner {
  private memo = new Map<string, Decision>();
  constructor(private first: FighterState['profile']) {}

  solve(a: FighterState, b: FighterState, phase: FightPhase = 'turn', onlyChoice?: FightChoice): Decision {
    if ((phase !== 'death' && a.currentWounds <= 0) || b.currentWounds <= 0 || a.successes() + b.successes() === 0)
      return {wounds: [a.currentWounds, b.currentWounds]};
    if (a.successes() === 0) return {wounds: swap(this.solve(b, a).wounds)};
    const key = [a.profile === this.first ? 0 : 1, phase, onlyChoice ?? '', stateKey(a), stateKey(b)].join('|');
    const cached = this.memo.get(key);
    if (cached) return cached;
    let moves = legalFightMoves(a, b, phase);
    if (onlyChoice !== undefined) moves = moves.filter(m => m.choice === onlyChoice);
    else if (a.strategy === FightStrategy.Strike) moves = moves.filter(isStrike);
    else if (a.strategy === FightStrategy.Parry && phase !== 'strike' && phase !== 'death') {
      const blocks = moves.filter(m => !isStrike(m));
      if (blocks.length) moves = [...blocks, ...moves.filter(move => {
        if (!isStrike(move)) return false;
        const ac = a.asEstimate(), bc = b.asEstimate();
        const extra = applyDie(ac, bc, move, phase);
        if (bc.currentWounds <= 0) return true;
        return extra && ac.successes() > 0 && legalFightMoves(ac, bc, 'strike').some(next => {
          const a2 = ac.clone(), b2 = bc.clone();
          applyDie(a2, b2, next, extra);
          return b2.currentWounds <= 0;
        });
      })];
    }
    let best: Decision | undefined;
    for (const move of moves) {
      const wounds = this.evaluate(a, b, move, phase).wounds;
      if (!best || better(wounds, best.wounds, phase === 'death' ? FightStrategy.MaxDmgToEnemy : a.strategy))
        best = {move, wounds};
    }
    const result = best ?? {wounds: [a.currentWounds, b.currentWounds] as Outcome};
    // Bound cache growth for unusually large profiles; correctness does not depend on caching.
    if (this.memo.size < 200000) this.memo.set(key, result);
    return result;
  }

  private after(a: FighterState, b: FighterState, move: FightMove, phase: FightPhase): Outcome {
    const extra = applyDie(a, b, move, phase);
    if (canDeathStrike(b, a)) return swap(this.solve(b, a, 'death').wounds);
    if (a.currentWounds <= 0 || b.currentWounds <= 0) return [a.currentWounds, b.currentWounds];
    if (extra && a.successes() > 0) return this.solve(a, b, extra).wounds;
    return swap(this.solve(b, a).wounds);
  }

  converted(a: FighterState, b: FighterState, phase: FightPhase): {move: FightMove; wounds: Outcome} {
    const blocks = legalFightMoves(a, b, 'turn', true).filter(m => m.choice === FightChoice.NormParry);
    // A normal block with no legal target still consumes the converted die.
    if (!blocks.length) blocks.push({choice: FightChoice.NormParry, blockCrits: 0, blockNorms: 0});
    let best: {move: FightMove; wounds: Outcome} | undefined;
    for (const move of blocks) {
      const ac = a.asEstimate(), bc = b.asEstimate();
      bc.jestUsed = true;
      const wounds = this.after(ac, bc, move, phase);
      if (!best || better(wounds, best.wounds, a.strategy)) best = {move, wounds};
    }
    return best!;
  }

  evaluate(a: FighterState, b: FighterState, move: FightMove, phase: FightPhase): {wounds: Outcome; tryJest: boolean} {
    const normal = this.after(a.asEstimate(), b.asEstimate(), move, phase);
    const p = jestChance(a, b, move);
    if (!p) return {wounds: normal, tryJest: false};
    const converted = this.converted(a, b, phase).wounds;
    const rolled: Outcome = [normal[0] * (1 - p) + converted[0] * p, normal[1] * (1 - p) + converted[1] * p];
    const tryJest = better(swap(rolled), swap(normal), b.strategy);
    return {wounds: tryJest ? rolled : normal, tryJest};
  }
}

let active: {a: FighterState['profile']; b: FighterState['profile']; signature: string; planner: Planner} | undefined;
function plannerFor(a: FighterState, b: FighterState): Planner {
  const reversed = active?.a === b.profile && active?.b === a.profile;
  const sig = reversed ? signature(b) + '|' + signature(a) : signature(a) + '|' + signature(b);
  if (!active || (!reversed && (active.a !== a.profile || active.b !== b.profile)) || active.signature !== sig)
    active = {a: a.profile, b: b.profile, signature: sig, planner: new Planner(a.profile)};
  return active.planner;
}
export function modernFightDecision(a: FighterState, b: FighterState, phase: FightPhase = 'turn', onlyChoice?: FightChoice): Decision {
  return plannerFor(a, b).solve(a.asEstimate(), b.asEstimate(), phase, onlyChoice);
}

export function modernMoveForChoice(a: FighterState, b: FighterState, choice: FightChoice): FightMove | undefined {
  const candidates = legalFightMoves(a, b).filter(move => move.choice === choice);
  // Resolution of an explicit die needs no search when there is no target/resource choice.
  // This also keeps low-level resolution usable with synthetic large dice pools.
  return candidates.length === 1 ? candidates[0] : modernFightDecision(a, b, 'turn', choice).move;
}

export function resolveModernMove(a: FighterState, b: FighterState, move: FightMove, phase: FightPhase = 'turn'): void {
  const planner = plannerFor(a, b);
  let resolved = move;
  if (jestChance(a, b, move) && b.rng && planner.evaluate(a, b, move, phase).tryJest
    && b.rng() < jestChance(a, b, move)) {
    resolved = planner.converted(a, b, phase).move;
    b.jestUsed = true;
  }
  const extra = applyDie(a, b, resolved, phase);
  resolveDeathStrike(b, a);
  if (a.currentWounds > 0 && b.currentWounds > 0 && extra && a.successes() > 0) {
    const followUp = modernFightDecision(a, b, extra).move;
    if (followUp) resolveModernMove(a, b, followUp, extra);
  }
}

export function resolveDeathStrike(dead: FighterState, enemy: FighterState): void {
  if (!canDeathStrike(dead, enemy)) return;
  const move = modernFightDecision(dead, enemy, 'death').move;
  if (move) resolveModernMove(dead, enemy, move, 'death');
}

export function resolveDevastating(a: FighterState, b: FighterState): void {
  if (a.devastatingResolved) return;
  a.devastatingResolved = true;
  if (a.currentWounds <= 0 || b.currentWounds <= 0) return;
  for (let i = 0; i < a.crits && b.currentWounds > 0; i++) {
    if (a.profile.mwx > 0) b.applyDmg(a.profile.mwx, false);
  }
  resolveDeathStrike(b, a);
}
