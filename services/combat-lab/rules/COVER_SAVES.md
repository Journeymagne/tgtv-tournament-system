# When Not to Take Cover Saves

Cover saves are optional — you *can* retain them. Almost always you should, and the calculator
always does. But there is a real case where taking cover costs you damage, and this page sets out
when that happens, why, and why the calculator doesn't model it.

---

## Why declining could ever be right

A cover save is retained as a normal success **without being rolled**, which has two consequences:

1. **It's locked.** A dice can only be retained once, so a rule that lets you retain a normal save as
   a critical save instead — the calculator's **NormsToCrits** input — cannot touch it. See
   [Retained vs Modified Dice](/rules/retained-vs-modified).
2. **You gave up the roll.** That dice could have come up a critical save on its own, or a normal
   save you were then free to promote.

And the two kinds of save are not worth the same against every attack:

- a **critical save** cancels any hit, crit or normal, one for one;
- a **normal save** cancels a normal hit one for one, but it takes **two** to cancel a critical hit.

So against an attacker whose hits are mostly critical, a guaranteed normal save is worth *half* of
what it looks like, while a rolled dice you can promote into a critical save is worth full value.
That is the whole trade.

---

## What the numbers actually say

Measured with the calculator itself: attacker with 4 dice at BS 3+ for 3/4 damage, defender on 3
dice, comparing **1 cover save** against **0 cover saves**. Lower is better for the defender.

| Attacker | Defender promotions | Save | With cover | No cover | Better |
|---|---|---|---|---|---|
| normal (crit on 6) | none | 3+ | 2.675 | 3.293 | **take cover** |
| normal (crit on 6) | NormsToCrits 1 | 3+ | 2.143 | 2.801 | **take cover** |
| normal (crit on 6) | NormsToCrits 2 | 4+ | 2.919 | 3.999 | **take cover** |
| Lethal 5+ (½ crits) | NormsToCrits 1 | 3+ | 2.807 | 3.232 | **take cover** |
| Lethal 4+ | NormsToCrits 1 | 3+ | 3.926 | 3.958 | take cover, barely |
| Lethal 4+ | NormsToCrits 2 | 3+ | 3.728 | **3.265** | **decline** |
| every success crits | NormsToCrits 1 | 3+ | 5.575 | **5.008** | **decline** |
| every success crits | NormsToCrits 1 | 4+ | 6.815 | **5.948** | **decline** |
| every success crits | NormsToCrits 2 | 3+ | 5.575 | **3.823** | **decline** |
| every success crits | **none** | 3+ | 6.464 | 7.226 | **take cover** |

Two things fall out of this, and both are worth knowing at the table:

**Without a norm→crit save promotion, always take cover.** Every row with no promotions favours
cover, at every save value and against every attacker tested — including one dealing nothing but
critical hits. Declining just to fish for a natural 6 is never worth a guaranteed save.

**With promotions, it flips once most of the incoming hits are critical.** With one promotion, cover
still wins while the attacker's hits are half crits or fewer; declining pulls ahead when nearly all
hits are critical (worth about 0.6–0.9 damage there). With two promotions the flip comes earlier,
around half crits, and the gap grows to roughly 1.6–1.8 damage against an all-crit attacker.

The mechanism is the one described above: a promotion turns a *rolled* normal save into a critical
save that cancels a critical hit outright, and the more of the incoming hits are critical, the more
that conversion beats a locked normal save which needs a partner to cancel anything.

**Rule of thumb:** take cover, unless you hold norm→crit save promotions *and* the incoming attack
is mostly critical hits — high Lethal, or a weapon that crits on 4+ or better.

---

## Why the calculator doesn't decide this for you

The calculator does make this kind of choice elsewhere: it declines **Punishing** and takes fewer
**Accurate** dice when that comes out ahead. Cover is deliberately left alone, for a reason visible
in the table above — **the right answer depends on the attacker**, and specifically on what share of
the incoming hits are critical.

Attack-side retain choices can see the defender. On a shoot, Punishing and Mystic Scry score each
line by expected damage against that defender's saves, cover, and Piercing. The cover decision
cannot: it is made while rolling the defender's own dice, which do not see the incoming hits. A
save's worth is defined entirely by the hits it has to cancel, and that dice step has no view of
them.

Doing it properly means hoisting the decision up to `calcDmgProbs`, which does see both sides:
compute the full damage distribution for each legal cover count and keep whichever minimises damage.
That is correct and not difficult — but it multiplies the cost of the most common configuration in
the whole calculator, since most shooting happens into cover. Every mass-analysis cell would pay it.

So the current behaviour is a deliberate trade: always take cover, be exactly right in the large
majority of cases, and document the corner rather than tax every other calculation for it.

---

## Checking it yourself

You don't need the feature to get the answer for a specific matchup — the comparison is two runs:

1. Set up the attack as normal, with the defender's **Cover Saves** at its real value.
2. Note the expected damage.
3. Set **Cover Saves** to 0 and compare.

If the second number is lower, that's a matchup where declining cover is correct. Given the table
above, it is worth checking when your operative has save promotions and is being shot by something
with heavy Lethal.

---

## If you want to implement it

The change lives in `calcDmgProbs` (`src/CalcEngineShoot.ts`), not in the dice step:

- loop `k` from `defender.autoNorms` down to 0, running the existing calculation with
  `defender.withProp('autoNorms', k)`;
- keep the distribution with the lowest expected damage, preferring the largest `k` on ties so the
  common case is unchanged;
- gate the loop so it only runs when declining could plausibly help — the defender needs a
  retain-style promotion (`normsToCrits > 0`, or Rending on defence) — which keeps the ordinary
  cover-only path at its current cost.

The Fight engine needs the same treatment separately, deciding once per fighter profile rather than
per simulated roll, as `chooseAutoNorms` already does for Accurate.
