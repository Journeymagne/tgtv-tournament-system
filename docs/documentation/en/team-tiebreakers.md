Team 3×3 has no individual game tiebreakers. Equal final VP is a draw. GP determines the team match outcome but is not a standings tiebreaker.

## From VP to GP

Examples: 18:14 VP → 14:6 GP; equal VP → 10:10; a lead of 10 VP or more → 20:0. Each game totals 20 GP; a three-game team match totals 60. Final VP includes Primary bonus.

```text
GP_A = min(20, max(0, 10 + VP_A − VP_B))
GP_B = 20 − GP_A
```

| Player VP lead | Player GP | Opponent GP |
| --- | --- | --- |
| 0 | 10 | 10 |
| 1 | 11 | 9 |
| 2 | 12 | 8 |
| 3 | 13 | 7 |
| 4 | 14 | 6 |
| 5 | 15 | 5 |
| 6 | 16 | 4 |
| 7 | 17 | 3 |
| 8 | 18 | 2 |
| 9 | 19 | 1 |
| 10+ | 20 | 0 |

> If the player has fewer VP, use the size of the difference and swap the GP values.

## Team tournament points (TP)

| Team GP after 3 games | Outcome | TP |
| --- | --- | --- |
| 0–27 | Loss | 0 |
| 28–32 inclusive | Draw | 1 |
| 33–60 | Win | 2 |

## Fixed team ranking order

Each next criterion applies only when previous ones are equal; higher is better. Full ties use initial seed, then ID. SoS, Buchholz, Head-to-head, VP Diff, total GP and MMR are not tiebreakers for this format; individual tournament criteria are not configurable here.

1. Total TP from completed team matches is the primary criterion.
2. Total Game Wins: individual wins by all team members, not the number of team match wins.
3. Total VP Scored: final VP scored by all team members in completed games, including Primary bonus.
4. Total Tac Op: raw Tac Op points from all team members in completed games, excluding the separate Primary bonus.

## Tac Op example

A player scores Crit 5, Kill 4, Tac 3 with Tac as Primary. Primary bonus = ceil(3/2) = 2. Add 14 to Total VP Scored, but only 3 to Total Tac Op, not 5.
