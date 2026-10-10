# Kill Team 2024 Weapon Rules

Weapon rules apply whenever a friendly operative uses a weapon that has them. Common weapon rules can be found below, and you may find rare weapon rules in your kill team's rules.

**General Rules:**
- Weapons gain no benefit from having the same weapon rule more than once, unless the weapon rule has an **x**, in which case select which x to use.
- If a friendly operative is using a weapon that has multiple weapon rules that would take effect at the same time, you can choose the order they take effect.

---

## Weapon Rules

### Accurate X
You can retain up to **x** attack dice as normal successes without rolling them.

**Special case:** If a weapon has more than one instance of Accurate x, you can treat it as one instance of **Accurate 2** instead (this takes precedence over x rules above).

---

### Balanced
You can re-roll **one** of your attack dice.

---

### Brutal
Your opponent can **only block with critical successes**.

---

### Ceaseless
You can re-roll any of your attack dice results of **one result** (e.g., results of 2).

---

### Devastating X
Each retained critical success **immediately inflicts x damage** on the operative this weapon is being used against, e.g., Devastating 3.

**Area effect:** If the rule starts with a distance (e.g., 1" Devastating x), inflict x damage on that operative and each other operative visible to and within that distance of it.

**Important:** The success isn't discarded after doing so—it can still be resolved later in the sequence.

---

### Heavy
An operative **cannot use this weapon** in an activation or counteraction in which it moved, and it **cannot move** in an activation or counteraction in which it used this weapon.

**Conditional Heavy:** If the rule is **Heavy (x only)**, where x is a move action, only that move is allowed, e.g., Heavy (Dash only).

**Note:** This weapon rule has no effect on preventing the Guard action.

---

### Lethal X+
Your successes equal to or greater than **x** are **critical successes**, e.g., Lethal 5+.

---

### Piercing X
The defender collects **x less defence dice**, e.g., Piercing 1.

**Conditional Piercing:** If the rule is **Piercing Crits x**, this only comes into effect if you retain any critical successes.

---

### Punishing
If you retain any critical successes, you can retain **one of your fails as a normal success** instead of discarding it.

---

### Relentless
You can re-roll **any** of your attack dice.

---

### Rending
If you retain any critical successes, you can retain **one of your normal successes as a critical success** instead.

**Calculator implementation:** a dice can only be retained once, so Rending can only promote a
*rolled* normal success — never one that was already retained without a roll (Accurate on attack,
cover on defence) or retained out of the fail pile by Punishing. Severe is worded as a *change*, so
it is not restricted this way. The same restriction applies to the calculator's NormsToCrits input.
Rending is optional ("you can"), so the calculator keeps the normal when converting it deals
strictly less damage. On a shoot that score includes the defender's saves, cover, Devastating,
and Piercing Crits; ties still convert. See [Retained vs Modified Dice](/rules/retained-vs-modified)
for the full breakdown.

---

### Saturate
The defender **cannot retain cover saves**.

---

### Severe
If you **don't retain any critical successes**, you can change **one of your normal successes to a critical success**.

**Important:** The Devastating and Piercing Crits weapon rules still take effect, but **Punishing and Rending don't**.

**Calculator implementation:** Severe is evaluated after Punishing, so Punishing only triggers from natural crits. Severe is optional ("you can"): the calculator scores taking it against declining it and keeps the decline when that deals strictly more damage. Devastating is part of the crit's value, and on a shoot the score is expected damage after saves, cover, and Piercing Crits. Rending is explicitly blocked on the line where Severe fires. With the KT2021 Waaagh ploy and three or more normals (no crits), Severe-before-Waaagh is the line scored against declining, which leaves Waaagh free; with exactly two normals Waaagh goes first.

---

### Shock
The first time you strike with a critical success in each sequence, also **discard one of your opponent's unresolved normal successes** (or a critical success if there are none).

---

## Quick Reference Table

| Weapon Rule | Effect Summary |
|-------------|----------------|
| **Accurate X** | Retain up to x dice as normal successes without rolling |
| **Balanced** | Re-roll 1 attack die |
| **Brutal** | Opponent can only block with crits |
| **Ceaseless** | Re-roll all dice of one result value |
| **Devastating X** | Each crit inflicts x damage immediately |
| **Heavy** | Cannot move and shoot with this weapon |
| **Lethal X+** | Successes ≥ x are critical |
| **Piercing X** | Defender gets x less defence dice |
| **Punishing** | If have crit, convert 1 fail to normal |
| **Relentless** | Re-roll any attack dice |
| **Rending** | If have crit, convert 1 normal to crit |
| **Saturate** | Defender cannot use cover saves |
| **Severe** | If no crits, convert 1 normal to crit |
| **Shock** | First crit strike discards one of the opponent's unresolved normal successes (or a crit if none) |

---

## Calculator Implementation Notes

### Reroll Targeting Strategy
**Fails only** is the shooting default. Shooting reroll abilities in this calculator only target fails, never norms or crits:
- Rerolling a fail can only improve (to norm/crit) or stay the same
- Rerolling a norm could get worse (to fail)
- Rerolling a crit could only get worse (to norm/fail)

Crit-fishing is a fight choice, not this default. The Fight calculator Notes say Balanced and Relentless will not reroll a normal success even if it would be wise to do so. See that note on the [Fight calculator](/fight/).

### Combined Reroll Abilities
The calculator supports combined reroll abilities where multiple effects apply in sequence:

**RerollOnesPlusBalanced (BothOnesAndBalanced):**
- First reroll all 1s
- Then reroll one additional fail that wasn't a 1 (no double reroll)

**RerollMostCommonFailPlusBalanced (CeaselessPlusBalanced):**
- First reroll all dice showing the most common fail result (Ceaseless)
- Then reroll one additional fail that wasn't rerolled by Ceaseless (no double reroll)
- If Ceaseless rerolled all fails, Balanced has nothing to target

### No Double Reroll Rule
A die cannot be rerolled twice in the same action. When combining reroll abilities:
- Track which dice were rerolled by the first ability
- The second ability can only target dice that weren't already rerolled
- `availFails = originalFails - firstRerollCount`

### Expected Ability Ordering (by effectiveness)
For a given scenario, reroll abilities should generally produce results in this order:
- CeaselessPlusBalanced ≥ Ceaseless
- CeaselessPlusBalanced ≥ OnesPlusBalanced
- CeaselessPlusBalanced ≥ Balanced
- Ceaseless ≥ RerollOnes (Ceaseless can reroll more dice)
- Relentless ≥ all other rerolls (rerolls ALL fails)

---

## Recent Improvements (December 2025)

### CeaselessPlusBalanced Implementation
- **Added** new combined reroll ability: `RerollMostCommonFailPlusBalanced`
- **Fixed** dice eligibility tracking: Balanced can only target fails that weren't rerolled by Ceaseless
- **Fixed** optimal targeting for shooting: those rerolls only target fails (never norms or crits)
- **File:** `CalcEngineCommon.ts` - `calcFinalDiceProbRerollMostCommonFailPlusBalanced()`

### Severe Rule Fix
- **Fixed** Punishing no longer triggers from Severe-created crits
- **Fixed** Rending no longer triggers from Severe-created crits
- **Added** `severeTriggered` flag to track when Severe creates a crit
- **Preserved** Devastating X and Piercing Crits X still work with Severe
- **File:** `CalcEngineCommon.ts` - `severeTriggered` in `resolveAfterPunishing`

### Reroll Targeting Strategy
- **Clarified** fails only is the shooting default: shooting rerolls only target fails
- **Rationale:** on a shot, rerolling fails can only improve; rerolling norms/crits can get worse
- **Fight:** crit-fishing is the Fight calculator Notes, not this default (see the section above)
- **Applied to:** Balanced, Ceaseless, Relentless, CeaselessPlusBalanced, OnesPlusBalanced

### No Double Reroll Rule
- **Documented** dice cannot be rerolled twice in same action
- **Implementation:** Track `availFails = originalFails - firstRerollCount`
- **Affects:** CeaselessPlusBalanced, OnesPlusBalanced

---

*Last updated: December 2025*
