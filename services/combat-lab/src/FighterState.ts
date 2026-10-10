import Model from "src/Model";
import FightStrategy from 'src/FightStrategy';
import FightChoice from "src/FightChoice";
import Ability from "./Ability";
import { RngFunction } from "src/MonteCarloFightDice";
import { maxRelicIgnoresPerBattle, relicDiceCount, relicIgnoreProb } from "src/SaintlyRelics";

export default class FighterState {
  public profile: Model;
  public crits: number;
  public norms: number;
  public strategy: FightStrategy;
  public currentWounds: number;
  public hasStruck: boolean;
  public hasCritStruck: boolean;
  public normScratchUsed: boolean; // JaS (Normals): whether this fighter's norm-only scratch is spent
  public relicUsed: boolean; // SaintlyRelics: whether this fighter's once-per-action ignore is spent
  public relicIgnoresUsed: number; // SaintlyRelics: ignores spent so far this battle (capped per battle)
  public hasDuelistParried: boolean; // Duelist: whether this fighter's once-per-fight free parry is spent
  public rng: RngFunction | null;
  // set on lookahead clones only: apply damage prevention as expected values, never rolled
  public estimateMode: boolean = false;
  // estimate mode only: probability the Saintly Relics ignore is still unspent. A failed roll does
  // not consume it, so this decays by (1 - ignoreProb) per attempt rather than dropping to 0.
  public estimateRelicAvailProb: number = 1;

  public constructor(
    profile: Model,
    crits: number,
    norms: number,
    strategy: FightStrategy,
    currentWounds: number = -1,
    hasStruck: boolean = false,
    hasCritStruck: boolean = false,
    rng: RngFunction | null = null,
    normScratchUsed: boolean = false,
    relicUsed: boolean = false,
    relicIgnoresUsed: number = 0,
    hasDuelistParried: boolean = false,
  ) {
    this.profile = profile;
    this.crits = crits;
    this.norms = norms;
    this.strategy = strategy;
    this.currentWounds = currentWounds === -1 ? this.profile.wounds : currentWounds;
    this.hasStruck = hasStruck;
    this.hasCritStruck = hasCritStruck;
    this.normScratchUsed = normScratchUsed;
    this.relicUsed = relicUsed;
    this.relicIgnoresUsed = relicIgnoresUsed;
    this.hasDuelistParried = hasDuelistParried;
    this.rng = rng;
  }

  public successes() {
    return this.crits + this.norms;
  }

  // relicWorthy: whether this strike is the biggest one still coming, so it's worth spending the
  // single per-action SaintlyRelics ignore on now (vs saving it for a larger pending strike).
  public applyDmg(dmg: number, relicWorthy: boolean = true) {
    // Lookahead clones run in estimate mode: damage prevention is applied as its EXPECTED value
    // instead of rolled. Rolling inside an estimate needs an rng, and either choice there is bad -
    // the live one corrupts the real fight's draws, a seeded one makes the estimate a step function
    // of its inputs, which is the very jitter Common Random Numbers exists to remove. Expected
    // values are deterministic and vary smoothly, so a decision only changes when the underlying
    // trade-off does. Wounds go fractional here; that is fine, estimates are only ever compared.
    if (this.estimateMode) {
      this.currentWounds = Math.max(0, this.currentWounds - this.expectedDmgAfterPrevention(dmg, relicWorthy));
      return;
    }
    if (relicWorthy && dmg > 0 && this.rng && this.profile.usesSaintlyRelics()
      && !this.relicUsed && this.relicIgnoresUsed < maxRelicIgnoresPerBattle && this.rollRelic()) {
      this.relicUsed = true;
      this.relicIgnoresUsed++;
      dmg = 0;
    }
    if (this.profile.usesFnp() && this.rng) {
      dmg = this.rollFnp(dmg);
    }
    this.currentWounds = Math.max(0, this.currentWounds - dmg);
  }

  // Expected damage left after Saintly Relics and Feel No Pain, for estimate mode.
  private expectedDmgAfterPrevention(dmg: number, relicWorthy: boolean): number {
    if (dmg <= 0) {
      return dmg;
    }
    let relicSurvivalProb = 1;
    if (relicWorthy && this.profile.usesSaintlyRelics()
      && !this.relicUsed && this.relicIgnoresUsed < maxRelicIgnoresPerBattle) {
      // The ignore wipes the whole strike, but only once: it is spent by a SUCCESSFUL roll, so a
      // later strike is only protected if every earlier attempt failed. Weighting by the running
      // availability probability keeps a multi-strike estimate honest — applying the full ignore
      // chance to every strike would credit the defender with a relic it had already spent.
      const ignoreProb = relicIgnoreProb(this.profile.saintlyRelics);
      relicSurvivalProb -= this.estimateRelicAvailProb * ignoreProb;
      this.estimateRelicAvailProb *= 1 - ignoreProb;
    }
    if (this.profile.usesFnp()) {
      // one roll per strike, each success shaving 1 damage
      dmg = Math.max(0, dmg - (7 - this.profile.fnp) / 6);
    }
    // Feel No Pain only rolls on a strike the relic did NOT ignore, so the two prevention steps
    // compose as P(not ignored) * E[damage after FNP] rather than stacking on the same strike.
    // Subtracting the FNP expectation from already-relic-scaled damage would spend FNP on the
    // probability mass where the strike had been wiped out entirely.
    return dmg * relicSurvivalProb;
  }

  private rollFnp(dmg: number): number {
    // FNP rolls once per strike; on success, reduce that strike's damage by 1
    if (dmg <= 0) return dmg;
    const fnpThreshold = this.profile.fnp;
    const roll = Math.floor(this.rng!() * 6) + 1; // roll 1-6
    return roll >= fnpThreshold ? dmg - 1 : dmg;
  }

  private rollRelic(): boolean {
    // roll 1 D6 (normal) or 2 D6 (inspiring); ignore the strike on any 6.
    // Roll all dice (no early return) so the rng-draw count is fixed regardless of outcome,
    // keeping the Monte Carlo stream aligned — same discipline as rollFnp's single fixed draw.
    const numDice = relicDiceCount(this.profile.saintlyRelics);
    let ignored = false;
    for (let i = 0; i < numDice; i++) {
      if (Math.floor(this.rng!() * 6) + 1 === 6) {
        ignored = true;
      }
    }
    return ignored;
  }

  public applyDmgFromStrike(dmg: number, atker: Model, isCrit: boolean) {
    if (isCrit) {
      this.hasCritStruck = true;
    }
  }

  public isFullHealth() {
    return this.currentWounds === this.profile.wounds;
  }

  public hammerhandDmg(
    crits: number | undefined = undefined,
    norms: number | undefined = undefined,
  ) {
    crits = crits ?? this.crits;
    norms = norms ?? this.norms;
    return this.profile.abilities.has(Ability.Hammerhand2021)
      && !this.hasStruck
      && (crits > 0 || norms > 0)
      ? 1 : 0;
  }

  public possibleDmg(crits: number, norms: number): number {
    return this.hammerhandDmg(crits, norms) + this.profile.possibleDmg(crits, norms);
  }

  public totalDmg(): number {
    return this.possibleDmg(this.crits, this.norms);
  }

  public nextDmg(): number {
    let dmg = 0;

    if (this.crits > 0) {
      dmg += this.profile.critDmg;

      // The follow-up is another crit only while a second crit is still in hand.
      // Otherwise it spends a normal, and only if one remains. Hammerhand is the
      // first strike only, added once below.
      if (this.profile.has(Ability.MurderousEntrance2021) && !this.hasCritStruck) {
        if (this.crits > 1) {
          dmg += this.profile.critDmg;
        }
        else if (this.norms > 0) {
          dmg += this.profile.normDmg;
        }
      }
    }
    else if (this.norms > 0) {
      dmg += this.profile.normDmg;
    }

    dmg += this.hammerhandDmg();
    return dmg;
  }

  public nextStrike(): FightChoice {
    return this.crits > 0 ? FightChoice.CritStrike : FightChoice.NormStrike;
  }

  public reset(crits: number, norms: number, currentWounds: number): void {
    this.crits = crits;
    this.norms = norms;
    this.currentWounds = currentWounds;
    this.hasStruck = false;
    this.hasCritStruck = false;
    this.normScratchUsed = false;
    this.relicUsed = false;
    this.hasDuelistParried = false;
  }

  public clone(): FighterState {
    const copy = new FighterState(
      this.profile,
      this.crits,
      this.norms,
      this.strategy,
      this.currentWounds,
      this.hasStruck,
      this.hasCritStruck,
      this.rng,
      this.normScratchUsed,
      this.relicUsed,
      this.relicIgnoresUsed,
      this.hasDuelistParried,
    );
    // carried so a lookahead nested inside a lookahead stays an estimate, and so a nested clone
    // doesn't hand the relic back after earlier strikes in the same estimate already spent it
    copy.estimateMode = this.estimateMode;
    copy.estimateRelicAvailProb = this.estimateRelicAvailProb;
    return copy;
  }

  // A lookahead clone: never rolls, never touches the caller's rng, and prevents damage by
  // expected value. Nested clones inherit the mode through clone().
  public asEstimate(): FighterState {
    const copy = this.clone();
    copy.rng = null;
    copy.estimateMode = true;
    return copy;
  }

  public withStrategy(strategy: FightStrategy): FighterState {
    const copy = this.clone();
    copy.strategy = strategy;
    return copy;
  }
}
