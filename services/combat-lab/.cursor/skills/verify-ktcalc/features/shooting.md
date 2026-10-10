# Shooting calculator

Observable end state: on `/`, the heading is `Kill Team 2024 Shooting Calculator`. Pressing `+` next to Situation 1's Attacks control changes that select and changes the `Average Damage: N.NN` header in the same panel. Situation 2's `Average Damage` stays at its previous value.

## Sub-features

- Situation 1 and Situation 2, each with Attacker, Defender, Rounds, and a results column.
- Attacker knobs: Attacks, BS, Normal Dmg, Crit Dmg, Devastating, Piercing, Piercing Crits, Reroll, Lethal, Auto-successes (the `N.AutoNorms` label), plus Rending, Severe, and Punishing checkboxes. The Advanced checkbox reveals the extra attacker rows.
- Defender knobs: Save, Wounds, cover saves, Obscured, Indomitus, JaS (Crits), JaS (Normals).
- Results in each situation: `Average Damage`, `Injury Chance`, `Kill Chance`, and `Dmg probs for exact scenario` (accordion headers). The headers show the numbers without expanding.

## How to get to it (user POV)

Open the site root. The Shoot header link (`aria-label` `Kill Team Shoot Calculator`) has `aria-current="page"` because this is the default view. The `h1` reads `Kill Team 2024 Shooting Calculator`. Situation 1 is the left panel on a wide window.

## Driving it with the browser helper

With the dev server up and doctor passing:

```sh
.cursor/skills/verify-ktcalc/scripts/drive-shoot.mjs
```

That is the scripted path. The same steps by hand, scoped to the visible Situation 1 panel. Its title is the text node `Situation 1` in the title bar (not a span; Situation 2's title is a span because that bar has the copy button):

1. Wait for `h1` text `Kill Team 2024 Shooting Calculator`.
2. Inside that panel, read `select#s1-atk-Attacks` (default `4`) and the accordion header matching `Average Damage:`.
3. Read Situation 2's `Average Damage` as the unchanged control.
4. Click the `button` whose text is `+` immediately after the Situation 1 Attacks select.
5. Situation 1 Attacks is no longer `4`, its Average Damage text changed, and Situation 2's Average Damage did not.

Evidence: `verify-artifacts/shoot-before.png`, `verify-artifacts/shoot-after.png`, `verify-artifacts/shoot-result.json`.

## Gotchas

- Shoot, Fight, and the hidden mass view are all mounted. Inactive views are `display: none`, not unmounted. Always start from the visible panel title.
- Select ids are prefixed per panel: `s1-atk-`, `s1-def-`, `s1-opt-` for Situation 1 and `s2-…` for Situation 2 (e.g. `s1-atk-Attacks`, `s2-def-Wounds`).
- The `+` / `-` buttons are not labeled. The Attacks `+` is the next sibling of that panel's Attacks `select`.
- Advanced attacker and defender rows are hidden until that panel's Advanced checkbox is checked, unless the value is already non-default.
- Default models: attacker 4 dice, BS 3+, normal damage 3, crit damage 4; defender save 3+, 12 wounds. Do not hard-code an expected damage total; assert that the readout moved and is still `N.NN`.
