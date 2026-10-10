# Kill Team Rules Reference

This directory contains reference documentation for Kill Team 2024 game rules.

## Files

- **WEAPON_RULES.md** - Complete reference for all weapon rules (Accurate, Balanced, Brutal, Ceaseless, Devastating, Heavy, Lethal, Piercing, Punishing, Relentless, Rending, Saturate, Severe, Shock)
- **COMBAT_RULES.md** - Defense mechanics and the shooting save sequence (defense dice, saves, cover, FNP, Saintly Relics)
- **FIGHT_RULES.md** - Melee fight resolution: strike/parry alternation, what a parry can cancel, the engine's strike-vs-parry decision logic, and hand-verifiable scenarios
- **COVER_SAVES.md** - When declining an optional cover save actually reduces damage (save promotions vs a mostly-critical attack), measured with the engine, and why the calculator always takes cover
- **RETAINED_VS_MODIFIED_DICE.md** - The "a dice can only be retained once" rule: which effects lock a dice (cover, Accurate, Punishing), which can still change one (Severe, Waaagh), which are blocked (Rending, NormsToCrits, Mystic Scry), and the engine's known limitations here
- **WEAPON_BALANCE.md** - Method and measured results for comparing whole weapon profiles by power level: the fixed defender slate, kill-chance vs damage as the yardstick, scoring each weapon plain and buffed, and the balanced melee/shooting sets that came out of it (harness: `src/WeaponBalance.test.ts`)

## Purpose

These files serve as quick reference documentation for:
- Understanding game mechanics when implementing calculator features
- Validating ability implementations against official rules
- Providing context for code comments and documentation

## Usage with Windsurf

These markdown files are automatically indexed by Windsurf and can be referenced in conversations about game mechanics, calculator features, or rule clarifications.
