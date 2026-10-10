# Kill Team 2024 Combat Rules

## Defense Mechanics

### Defense Dice
**All operatives roll exactly 3 defense dice.**

This is a **fixed value** in Kill Team 2024 and cannot be modified by abilities or equipment, with one exception:

**Exception - Piercing X:**
- Piercing 1: Defender rolls 2 defense dice
- Piercing 2: Defender rolls 1 defense die
- Piercing 3: Defender rolls 0 defense dice (no save possible)

### Save Characteristic
Each operative has a Save value (e.g., 3+, 4+, 5+):
- **Normal success**: Die roll ≥ Save value
- **Critical success**: Die roll of 6
- **Fail**: Die roll < Save value

### Cover Saves
Operatives in cover can retain **automatic saves** without rolling:
- Cover provides "auto-successes" retained before rolling defense dice
- These are retained as normal successes (not critical)
- Piercing can reduce the number of available cover saves

**A dice can only be retained once.** A cover save was retained (as a normal success) without ever
being rolled, so a rule that lets you *retain a normal success as a critical success instead*
— Rending's wording, and the calculator's **NormsToCrits** input — has nothing left to do with it.
Only saves that came off the dice can be promoted that way.

A rule worded as *changing* a success rather than retaining one is not restricted like this, and
could act on a cover save. Note that the change-worded promotions Kill Team actually gives you
(Severe, the KT2021 Waaagh ploy) are **attack** rules, so they never apply to saves — on defence
the practical effect is simply that cover saves cannot be promoted.

The same limit applies on the attack side to **Accurate** dice and to a **Punishing** fail
retention: both are already-retained dice, so Rending and NormsToCrits can't promote them.

See [Retained vs Modified Dice](/rules/retained-vs-modified) for the full breakdown of which rules
lock a dice, which can still change one, and the worked examples.

---

## Changes from Kill Team 2021

### Removed Mechanics
❌ **Invulnerable Saves** - This mechanic no longer exists in KT2024

### Modified Mechanics
✓ **Defense Dice** - Now always 3 (was variable based on operative profile in 2021)

---

## Attack Sequence Overview

1. **Attacker rolls attack dice**
   - Number based on weapon profile
   - Modified by weapon rules (Balanced, Relentless, etc.)

2. **Attacker retains successes**
   - Normal successes and critical successes
   - Modified by weapon rules (Accurate, Lethal, Rending, Severe, etc.)

3. **Defender rolls defense dice (always 3)**
   - Modified by attacker's Piercing
   - Modified by cover saves

4. **Defender retains successes**
   - Normal successes and critical successes

5. **Cancel hits with saves**
   - Critical saves cancel any hit 1:1
   - Normal saves cancel normal hits 1:1
   - Normal saves cancel critical hits 2:1

6. **Resolve damage**
   - Remaining hits deal damage
   - Devastating damage occurs regardless of saves
   - Saintly Relics (if any): for a damaging attack dice, roll 1 D6 (or 2 D6 if INSPIRING); on any 6, ignore that dice's damage entirely (at most one dice per action)
   - Feel No Pain (if any): roll one die per surviving hit; each roll at/above the threshold reduces that hit's damage by 1

---

## Defender Abilities

### Obscured
When the defender is obscured from the attacker:
- All attacker crits are retained as normal successes instead
- Crit-triggered abilities cannot trigger (Rending, Punishing blocked)
- One attacker success is discarded at the end

### Just a Scratch (Crits)
Cancel one attack die just before damage is resolved, before saves:
- **Chooses the die that saves the most damage**: tries cancelling a crit and cancelling a normal, and keeps the lower damage
- Does not always drop the crit. Cancelling the normal is kept when it leaves less damage — the normal deals more, or a save can still block the die that remains
- On equal damage, cancels the higher per-die damage type (a crit when the two deal the same). If only one hit type landed, that type is cancelled
- MWx (Devastating) damage is counted from the original crits, so cancelling a crit never removes it

### Just a Scratch (Normals)
Cancel one normal hit just before damage is resolved:
- **Only targets normals**: Will not cancel critical hits
- Useful when you want to preserve the option to cancel crits with saves

### Feel No Pain (FNP)
Just before damage is resolved, roll one die for each surviving hit (strike):
- **Threshold**: 4+, 5+, or 6+ (set in the Defender's advanced params)
- On a roll **at or above** the threshold, that hit's damage is reduced by 1 (to a minimum of 0)
- One roll per surviving hit, not per point of damage
- Even MWx (Devastating) damage can be prevented via FNP

### Saintly Relics

Whenever an attack dice would inflict damage, roll to ignore all of that dice's damage:
- **Modes**: `1D6` (normal) or `2D6` (the operative is INSPIRING), set in the Defender's/Fighter's advanced params
- Roll the relic dice; on **any 6**, ignore all damage from that attack dice
- **Caps**: at most one attack dice ignored per action and two per battle; a failed roll uses up neither
- **Shoot (exact)**: targets the highest-damage surviving hit first (crits before norms), trying each damaging dice in turn until one is ignored; over multiple rounds the two-per-battle cap is enforced across the battle
- **Fight (Monte Carlo)**: spends the ignore on a strike only when no larger strike is still pending from that attacker (so it lands on the biggest)
- **Not modeled**: MWx (Devastating) damage is never ignored (matching Just a Scratch)

### Curse of Rot

Plague Marines firefight ploy. Tick it on the PLAGUE MARINE. After the enemy rolls its attack or defence dice, each **3** is a fail that can't be re-rolled, and deals 1 damage to that enemy:
- **Shoot, on the attacker**: the defender's 3s fail and each adds 1 damage. Each of those is its own 1-damage instance for Feel No Pain; Saintly Relics can't ignore it (it isn't an attack dice). If every attack misses, no defence dice are rolled, so there is no curse damage
- **Shoot, on the defender**: the attacker's 3s fail. The damage this deals to the attacker is not shown
- **Fight**: the other fighter's 3s fail and deal 1 damage each straight after the roll, before any strike
- Only the first roll counts. A die re-rolled later (Balanced, Ceaseless, Relentless) uses its new result normally, even a 3. Accurate and cover dice are retained, not rolled, so they can't be cursed
- A cursed die is a fail like any other for later rules (Punishing, FailsToNorms, Indomitus, Purity Seal)
- **Approximate**: with the BothOnesAndBalanced re-roll, the Balanced step keeps its usual formula
- Assumes the range condition (within 3", or 7" of an enemy with a Poison token) is met

---

## Key Principles

1. **Defense dice are always 3** (unless reduced by Piercing)
2. **No invulnerable saves** exist in KT2024
3. **Cover provides auto-successes**, not additional dice
4. **Piercing is the only way** to reduce defense dice below 3

---

*Last updated: September 2026*
