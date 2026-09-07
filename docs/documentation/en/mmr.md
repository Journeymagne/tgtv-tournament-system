MMR is an Elo rating, separate from tournament points, GP and tiebreakers. A standard new account starts at 1000; administrators can adjust rating values.

## Formula for two registered players

R\_A and R\_B are pre-game ratings in the selected rating track. E\_A is A's expected result. S\_A = 1 for a win, 0.5 for a draw and 0 for a loss. K is fixed at 32.

A's change is rounded to an integer with Math.round. B receives exactly the opposite change, not a separately rounded value. The two ratings therefore retain their total. VP or GP margin, faction, tournament round count and Primary bonus do not directly increase the MMR change.

```text
E_A = 1 / (1 + 10^((R_B − R_A) / 400))
Δ_A = Math.round(32 × (S_A − E_A))
Δ_B = −Δ_A
R′_A = R_A + Δ_A;  R′_B = R_B + Δ_B
```

## Worked examples

| R\_A | R\_B | S\_A | Δ\_A | R′\_A | R′\_B |
| --- | --- | --- | --- | --- | --- |
| 1000 | 1000 | 1 | +16 | 1016 | 984 |
| 1000 | 1000 | 0.5 | 0 | 1000 | 1000 |
| 1000 | 1200 | 1 | +24 | 1024 | 1176 |
| 1000 | 1200 | 0 | -8 | 992 | 1208 |
| 1000 | 1200 | 0.5 | +8 | 1008 | 1192 |

> Beating a stronger opponent earns more points. Drawing with a stronger opponent can raise your rating; drawing with a weaker one can lower it.

## TTS, IRL and combined MMR

Individual ratings have three independent tracks. A TTS game changes TTS and combined rating, not IRL. An IRL game changes IRL and combined, not TTS.

Combined MMR is neither the average nor the sum of TTS/IRL. It is a separate Elo history covering both venues. It uses its own pre-game ratings, so its change can differ from the TTS or IRL change.

## When individual MMR changes

Only completed results count. TTS needs opponent confirmation or an administrator's save; a pending result does not change rating. Regular matchmaking games are ranked. Tournament individual MMR changes under Ranked; Unranked disables it without disabling tournament points or standings.

At equal VP, a win decided by enabled game tiebreakers counts as an Elo win. Team WTC has no individual tiebreakers: equal VP gives S = 0.5.

## Exception: an opponent without an account

In a ranked individual tournament, if only one of the two participants has an account, that registered player receives a fixed +15 MMR for the completed game, regardless of win, draw or loss. This is the app's current special rule, not Elo. +15 applies to the venue track and combined rating. If neither has an account, no individual MMR is awarded. A bye is not a played game and gives no MMR.

## Team MMR

Team rating belongs to the team; it is not the average of its players. Its initial base is 1000, with separate TTS and IRL tracks. The same K = 32 Elo formula is applied once per completed 3×3 match: S = 1 for 2 TP, 0.5 for 1 TP and 0 for 0 TP. Different rosters of one team contribute to that team's rating; a match between two rosters of the same team does not change it.

Important: currently, Unranked disables individual MMR, but team rating is replayed from all completed team matches, including Unranked. This is a separate behavior of the team rating calculation.

## Result corrections

Correcting or deleting a result replays rating history. Later game changes can change too, because their expected scores depend on new pre-game ratings. Individual and team MMR are recalculated separately; neither is added to TP or used as a standings tiebreaker.
