# Fighting calculator

Observable end state: after switching to Fight, the `h1` is `Kill Team 2024 Fight Calculator`, the Results panel shows `FighterA` and `FighterB`, and each side shows `DeathChance:` and `AvgRemainingWounds:`. Pressing `+` on Fighter A's Attacks select changes Fighter A's `AvgRemainingWounds` (or `AvgDmg`) text. Fighter B's attacks select stays where it was.

## Sub-features

- Fighter A and Fighter B panels (WS, Attacks, Wounds, damage, weapon-rule checkboxes, Advanced).
- Fight Options panel: `Fighter A Strategy`, `Fighter B Strategy`, `Goes first` (`A` or `B`), and `Rounds`.
- Results panel with per-fighter death chance, average remaining wounds, and average damage.

## How to get to it (user POV)

From any calculator view, click the header link `aria-label` `Kill Team Fight Calculator` (visible label `Fight`). The address becomes `/fight/` and keeps any other query keys already present. The Fight link gets `aria-current="page"`; the Shoot link loses it.

## Driving it with the browser helper

There is no separate fight script. Use the same Chrome session pattern as `drive-shoot.mjs` (doctor first, fresh profile, click real controls) and do this:

1. Click `a[aria-label="Kill Team Fight Calculator"]`.
2. Wait until `h1` text is `Kill Team 2024 Fight Calculator` and the Fight link has `aria-current="page"`.
3. Scope to the visible panel titled `Fighter A` (a text node in the title bar, same pattern as Situation 1). Ignore hidden Shoot selects.
4. Read `select#fa-Attacks` in that panel and the `AvgRemainingWounds:` value in the Results panel under the `FighterA` heading.
5. Click the `+` button that is the next sibling of Fighter A's Attacks select.
6. Fighter A's Attacks value changed, and the `AvgRemainingWounds:` number for FighterA changed. Fighter B's Attacks select is unchanged.

The results block is the panel titled `Results`. `FighterA` and `FighterB` are plain text rows, not headings.

## Gotchas

- Select ids are prefixed per panel: `fa-` (Fighter A), `fb-` (Fighter B), `fo-` (Fight Options, e.g. `fo-Rounds`). The hidden shoot situations use `s1-`/`s2-` prefixes, so the fight ids no longer collide with them.
- Fight results are Monte Carlo inside the page. Read the text the Results panel actually rendered; do not recompute in the console and call that the check.
- The header Fight link keeps the current query string on `/fight/`. A shoot share URL can therefore sit on the fight view. Judge the view by the `h1` and the header link with `aria-current="page"`, not only by the presence of `a1=`.
