# Situation comparison

Observable end state: the matrix titled `Comparison Matrix (Avg Dmg + Kill % vs W)` is on the shoot view, under the two situations. Its header row includes `S1`, `S2`, and `Δ` groups. Clicking `Copy From Situation 1` makes Situation 2's Attacks select match Situation 1, and the matrix `Δ` cells for the copied profile read as a zero difference (`0` or `0.00`, not a signed delta).

## Sub-features

- `Copy From Situation 1` on the Situation 2 title bar.
- The matrix columns for each save (Sv 2+ through 5+ by default) with S1, S2, and delta.
- The `Show Sv 6+` checkbox in the matrix title bar, which adds the Sv 6+ group.

## How to get to it (user POV)

Stay on the shooting calculator (`h1` `Kill Team 2024 Shooting Calculator`) and scroll below Situation 1 and Situation 2. The matrix is always rendered there; it is not a separate route.

## Driving it with the browser helper

1. On `/`, in the Situation 1 panel, click Attacks `+` once so the two situations differ. Confirm Situation 1's Average Damage changed and Situation 2's did not (same bar as the shooting feature).
2. Click the button whose text is `Copy From Situation 1` (it sits in the Situation 2 title bar).
3. Situation 2's `select#s2-atk-Attacks` now equals Situation 1's.
4. In the panel titled `Comparison Matrix (Avg Dmg + Kill % vs W)`, the first data row (`Avg`) shows S1 and S2 equal and the delta cell is zero rather than a `+` or `-` value.
5. Check the checkbox labeled `Show Sv 6+`. A `Sv 6+` column group appears in the header.

Capture the matrix before the copy (a non-zero delta) and after the copy (zero delta).

## Gotchas

- Copy clones Situation 1 onto Situation 2 in the page. It does not write the URL until Add Share Params is used.
- Delta styling treats a difference under 0.001 as equal. Assert the visible cell text, not the background color.
- The matrix uses Situation 1's wound count for the combined row (`comboWounds`). Copying does not by itself change the defender wounds unless Situation 1's wounds already differed.
