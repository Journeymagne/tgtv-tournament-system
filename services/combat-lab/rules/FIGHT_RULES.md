# Kill Team 2024 Fight (Melee) Resolution

This document describes how the calculator resolves a **fight** (close combat), so the
results can be checked by hand. It covers the alternating strike/parry sequence, the rules
for what a parry can cancel, and the decision logic the engine uses to choose between
striking and parrying. Worked scenarios at the end can be verified step by step.

The behavior described here lives in:
- [`src/CalcEngineFightInternal.ts`](https://github.com/jfreal/ktcalc/blob/main/src/CalcEngineFightInternal.ts) — turn loop and decision logic
- [`src/FighterState.ts`](https://github.com/jfreal/ktcalc/blob/main/src/FighterState.ts) — per-fighter state, strike order, damage
- [`src/FightStrategy.ts`](https://github.com/jfreal/ktcalc/blob/main/src/FightStrategy.ts) — the four strategies

> The fight engine is **Monte Carlo**: each fighter's attack dice are rolled many times and
> the resolution below is run per simulation. The rules in this doc describe a single
> resolution (one set of rolled dice); the calculator's output is the distribution over
> many such resolutions.

---

## Dice

After rolling and retaining, each fighter holds some number of:
- **Crits** — critical successes
- **Norms** — normal successes

Each fighter has a `normDmg` and `critDmg` (default 3 and 4).

---

## Turn structure

Both fighters reveal their retained dice. Then they **alternate**, resolving **one die per
turn**, starting with the first fighter. On its turn a fighter either:

- **Strikes** — spends one success to deal damage to the enemy, or
- **Parries** — spends one success to cancel one (or more) of the enemy's unresolved successes.

The loop continues while either fighter still has successes and both are alive
(`resolveFight`). A fighter with no successes simply passes its turn; the other keeps
resolving its remaining dice.

Some abilities act **before** the alternation begins (e.g. **Duelist** forces one free parry
up front — see `handleDuelist`).

---

## Multiple rounds and Injured

With **Rounds** above 1, the fight is repeated with each fighter's wounds carried over, and it
stops once either fighter is incapacitated. Each round rolls fresh dice.

A fighter that starts a round with **fewer than half its starting wounds** is **injured**: its
weapon's Hit stat (WS) is worsened by 1 for that round's roll, to no worse than 6+. Exactly
half is not injured. Round 1 always starts uninjured, so only later rounds can change. Damage
taken during a round does not change that round's roll, because the dice are already rolled.

---

## What a parry can cancel

This is the heart of the order-of-operations questions.

| Parry die | Can cancel |
|-----------|-----------|
| **Normal parry** | one enemy **normal** success only |
| **Crit parry**   | one enemy **crit**, or if none, one enemy **normal** |

Key consequence: **a normal success cannot parry a crit.** If your only remaining die is a
crit and the enemy holds only normals, the enemy cannot parry it.

Modifiers:
- **Storm Shield** — each parry cancels **2** successes instead of 1 (`cancelsPerParry()`).
- **Dueller** — a crit parry cancels one enemy crit **and** one enemy normal (or two normals).
- **Brutal** (on the enemy weapon) — the enemy's normal successes **cannot be parried at all**;
  only a crit parry can cancel them, and norm-vs-norm parry is disallowed.

---

## Strike order: crit-first, except to deny a normal parry

When a fighter decides to **strike**, the **default** is to spend a **crit first** if it has
one, otherwise a normal (`FighterState.nextStrike`). Striking crit-first front-loads your
biggest die, which matters when you might not survive to spend every success.

`preferredStrikeChoice` compares **norm-first** when you hold **both** a crit and a normal and
any of these is true:

- the enemy has **no crits**, so a normal parry can cancel your normal but not your crit.
  Striking the **norm first** forces it through before they can parry it, while your crit stays
  unparryable. Crit-first would leave a lone normal for them to parry away.
- the enemy **zeros or halves your first strike** (Just a Scratch, or Half Damage on the first
  strike). Leading with the cheaper die can leave the bigger one intact. An enemy crit does
  not skip this comparison: their crit may still parry yours if you lead with the normal.
- your **normal out-damages your crit**. Hammerhand's +1 lands on whichever die is first, so
  it keeps that gap.

Norm-first is *not* always better: against a **striking** enemy in a death-race you may die
before spending the second die, so front-loading the bigger hit deals more. The engine
**simulates both orders** against the enemy's actual strategy and keeps the one that better
serves the chooser's goal (less enemy health for Strike / Max Dmg, more of your own for Min
Dmg), defaulting to crit-first on a tie.

---

## Decision logic (strike vs parry)

On each turn, `calcDieChoice` decides in this order. The first rule that applies wins:

1. **Enemy has no successes** → **strike** (a parry would cancel nothing).
2. **Lethal strike estimate** → resolve the next strike on copies of both fighters, including
   Just a Scratch and other damage prevention, and **strike** if the target reaches zero wounds.
   Random prevention (FNP / Saintly Relics) uses expected values, so this remains a heuristic,
   not a guarantee of a kill. The estimate changes neither the live fighters nor their RNG streams.
   Also forced to strike if the enemy weapon is **Brutal** and you have no crits (your
   normals can't parry it, so they may as well strike).
3. **Shock strike** → if you have **Shock**, haven't crit-struck yet, and have a crit, you must
   **strike** now when that strike's discard removes an enemy success: the enemy has **no crits**
   (Shock discards a normal) **or no normals** (Shock discards a crit). A Parry fighter would
   otherwise keep parrying a crit-only opponent and never land the discard. The die order follows
   the strategy rule below: for a mixed crit+norm hand under Strike / Max Dmg / Min Dmg,
   `preferredStrikeChoice` may still strike norm-first against a norms-only enemy; otherwise the
   shocking crit lands immediately. When the enemy still holds both crits and normals, Shock would
   only discard a normal, so this shortcut does not override a crit parry.
4. **Awesome parry** → if you can parry the enemy's **last** success and still kill the enemy
   with what remains, **parry** (`calcParryForLastEnemySuccessThenKillEnemy`).
5. **By strategy**:
   - **Strike** → always strike; the die order is chosen by `preferredStrikeChoice` (see below).
   - **Parry** → `wiseParry`: crit-parry an enemy crit if possible; else norm-parry an enemy
     normal; else crit-parry an enemy normal; else (only norms left vs enemy crits/Brutal) strike.
   - **Max Dmg To Enemy** / **Min Dmg To Self** → simulate **strike-all** vs **parry-all** from
     this point (clone both fighters, resolve to the end each way) and pick whichever leaves the
     enemy lower (Max Dmg) or yourself higher (Min Dmg).

Whenever a rule above resolves to **strike** under the **Strike**, **Max Dmg**, or **Min Dmg**
strategies, or under **Parry** once the enemy has no successes left, the actual die is chosen by
`preferredStrikeChoice` (crit-first by default,
norm-first to deny a normal parry or to feed an enemy's first-strike negation — see
[Strike order](#strike-order-crit-first-except-to-deny-a-normal-parry)). The one exception is the
**lethal-strike** rule (#2), which strikes crit-first when that strike is estimated to kill.

---

## Worked scenarios

Defaults unless noted: `normDmg = 3`, `critDmg = 4`, no special abilities, plenty of wounds on
both sides (so no lethal-strike shortcut), `cancelsPerParry = 1`.

### Scenario A — normal parry cannot touch a crit

- **Attacker** `{1 crit, 1 norm}`, strategy **Max Dmg To Enemy**, goes first.
- **Defender** `{2 norms, 0 crits}`, strategy **Parry**.

The engine strikes **norm-first** here (the defender holds no crits, so it can only parry a
normal):

1. Attacker norm-strikes → **3 dmg** to defender. Attacker holds `{1 crit}`.
2. Defender cannot parry a crit with a normal, so it strikes → 3 dmg to attacker. Defender holds `{1 norm}`.
3. Attacker crit-strikes → **4 dmg** to defender.
4. Defender strikes its last norm → 3 dmg to attacker.

**Attacker deals 7.**

Had the attacker struck **crit-first** instead (the wrong line here):

1. Attacker crit-strikes → 4 dmg to defender. Attacker holds `{1 norm}`.
2. Defender norm-parries the attacker's remaining norm → attacker holds `{}`.
3. Attacker passes; defender strikes its remaining norm.

**Attacker would deal only 4.** The difference (7 vs 4) is the parry-denial line: striking your
normals first forces them through *before* the enemy can parry them, and the enemy's normals can
never parry your crit.

### Scenario B — striking first to deny a parry, then still landing the crit

Same as Scenario A but stated as a principle: when the **enemy holds only normals**, every
normal you strike is one fewer normal the enemy can parry, and your crits are unparryable.
Resolving your normals before your crit therefore maximizes damage pushed through a
parrying defender.

### Scenario C — when order does **not** matter

- **Attacker** `{1 crit, 1 norm}` vs **Defender** `{2 norms}`, but defender strategy is **Max Dmg To Enemy**.

In *this* scenario the Max-Dmg defender gains nothing by parrying — it survives either way and
a parry deals no damage to the attacker — so it just strikes both norms. Both attacker dice land
regardless of order, so crit-first vs norm-first give the **same** total. Order only matters
when the defender *would* parry away one of the attacker's normals.

(Note: **Max Dmg To Enemy** does not parry *never* — it parries when that raises its own total
damage, e.g. to survive and land more strikes; see the `calcDieChoice` decision logic. It just
has no reason to here.)

---

## Edge case: norm-first to deny a normal parry (modeled)

This was previously a gap — the engine always struck crit-first — and is now handled by
`preferredStrikeChoice`. When:

- the attacker holds a **mix of crits and norms**, and
- the defender is **parrying with normals only** (no crits to parry your crit),

striking norm-first pushes more damage than crit-first (Scenario A). The same simulation also
runs when the enemy **does** hold a crit, if they zero or halve the first strike or if the
normal out-damages the crit. It picks norm-first only when that order genuinely deals more —
and stays crit-first in a death-race, where front-loading the bigger die wins, or on a tie.
Because the decision runs through the real resolution path, first-strike effects (Hammerhand's
+1, Just a Scratch, Murderous Entrance) are accounted for automatically.

Regression coverage lives in `CalcEngineFight.test.ts` under
*"calcDieChoice, norm-first to deny a normal parry"* and
*"both-orders simulation still runs when the enemy holds a crit"*.

---

*Last updated: September 2026*
