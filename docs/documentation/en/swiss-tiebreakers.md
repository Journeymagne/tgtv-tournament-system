A game's winner and a player's place in the standings are two separate calculations.

## How priority works

Match points come first: win 3, draw 1, loss 0. Only the tiebreakers enabled by the organizer are applied, in the configured order. Each next criterion compares only players still tied after earlier criteria. Higher is better for all five criteria.

The organizer selects up to four different criteria from five. There is no mandatory universal order. Disabled criteria do not affect places. If all enabled values are equal, the list uses initial seed, then ID; those players can share a displayed rank before final results are published.

## Strength of Schedule (SoS)

The sum of the current match points of opponents from completed matches. It is not average MMR or win percentage. Playing the same opponent again adds their points again.

Example: opponents have 9, 6 and 3 points. SoS = 9 + 6 + 3 = 18. It changes as those opponents finish more matches.

## Buchholz — trimmed

This app uses trimmed Buchholz: remove one highest and one lowest opponent score, then sum the rest. With two opponents or fewer, the value is 0.

Example: 9, 6, 3 → remove 9 and 3 → Buchholz = 6. Tied extreme values lose one occurrence each, not every occurrence.

## Head-to-head

Count wins in completed matches between the players still tied on match points and higher-priority criteria. Draws add no wins. Matches against players outside that tied group do not count.

Example: A, B and C remain tied. A beat B and C: 2 wins. B beat C: 1 win. C: 0. If an earlier criterion already separated C, games against C are excluded here.

## Total VP

The sum of a player's final VP in completed matches. Final VP includes Primary bonus: Crit Op + Kill Op + Tac Op + half the selected Primary Op score, rounded up.

Example: final scores of 14, 18 and 12 give Total VP = 44. These are not match points awarded for wins.

## VP Diff

The sum of «my final VP − opponent's final VP» in completed matches. This can be negative.

Example: 18:12, 10:15, 14:14 → VP Diff = 6 − 5 + 0 = 1. A game won by an individual tiebreaker at equal VP still contributes 0 VP Diff.

## Unfinished games, byes and publication

Unconfirmed and unfinished results do not count. A bye awards 3 match points and one win, but 0 VP, 0 VP Diff, and no opponent for SoS/Buchholz or head-to-head.

Withdrawn and removed players are excluded from current standings. An opponent no longer in those standings contributes 0 to SoS/Buchholz. The organizer fixes the final order when publishing results.

## Tiebreakers within a game

Individual Swiss allows draws. Equal VP with game tiebreakers disabled gives each player 1 match point. If game tiebreakers are enabled in the result form, use the following order.

1. Primary bonus: compare the bonus points, ceil(selected Op score / 2), not the raw selected Op score.
2. Crit Op + Tac Op: compare their sum without Primary bonus. Kill Op is not added here.
3. APL on the table: compare each side's value entered in the APL on table field. Players supply it; the app does not derive it from the roster or board state.
4. Roll-off: if still tied, enter the roll-off winner. This is separate from the automatic Attacker roll in team pairings.

> These criteria choose the game winner without changing VP. They are separate from standings tiebreakers.
