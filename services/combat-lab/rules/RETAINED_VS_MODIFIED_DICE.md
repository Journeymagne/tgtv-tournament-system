# Retained vs Modified Dice

Some Kill Team rules turn a normal success into a critical success. Some do not work on every
normal success you are holding. Which ones depend on a single line of wording, and it is easy to
miss at the table.

This page explains the rule, sorts every effect the calculator supports into the two camps, and
shows exactly what the engine does with each.

---

## The rule

**A dice can only be retained once.**

When you retain a dice, you are declaring what it is — "this is a normal success" — and putting it
down. That declaration is spent. A later rule that asks you to **retain that dice again**, as
something better, has nothing left to work with. The dice is already locked in.

A rule that instead asks you to **change** a success you are already holding is doing something
different, and it works fine on a dice that has been retained.

So the wording is the whole rule:

| Wording | Example | Can it act on an already-retained dice? |
|---|---|---|
| "**retain** one of your normal successes as a critical success **instead**" | Rending | **No** |
| "**change** one of your normal successes to a critical success" | Severe | **Yes** |

The clearest case is a **cover save**. You retain it as a normal success without ever rolling that
dice. It is retained, immediately and permanently. A rule offering to retain a normal save as a
critical save instead cannot touch it — there is no un-retained dice there to retain.

### When all of this happens

**All dice are retained and modified before any hits are resolved.** Every effect on this page
happens in the dice step, while you are looking at your roll and deciding what to keep. Once the
shooting or the combat starts resolving, the dice are what they are — you cannot hold a promotion
in reserve and spend it later, after seeing how the first few hits land.

The one thing that does happen during the dice step is **Devastating x**, which inflicts its damage
the moment a critical success is retained. That still doesn't let you defer a decision: it means a
promotion which creates a critical success pays out immediately, not that you may wait and see.

That matters for reading the calculator's numbers: when it decides whether to take an optional rule
(Punishing, Accurate, Mystic Scry), it is making that decision **once, in the dice step**, exactly
as a player must. It never adapts the choice to how the damage turns out afterward.

---

## Which effects lock a dice

These produce a normal success that has **already been retained**. Nothing worded as a retention
can promote them afterwards.

| Effect | Wording | Where |
|---|---|---|
| **Cover saves** | Retained as a normal success without rolling | Defence |
| **Accurate X** | "Retain up to x attack dice as normal successes without rolling them" | Attack |
| **Punishing** | "You can **retain** one of your fails as a normal success instead of discarding it" | Attack |
| **Mystic Scry**, fail→norm half | "**Retain** one of your fails as a normal success" | Attack |

Cover and Accurate are obvious — the dice was never rolled. Punishing and Mystic Scry's fail rescue
are the ones people miss: they save a fail by *retaining* it, so that dice has now been retained
once and is closed to further retention. That is why taking Mystic Scry's fail→norm option does not
hand Rending another norm to promote.

---

## Which effects can act on a locked dice

These **change or promote** a success rather than retaining one, so an already-retained dice is a
legal target.

| Effect | Wording | Where |
|---|---|---|
| **Severe** | "**Change** one of your normal successes to a critical success" | Attack |
| **Waaagh!** (KT2021 Kommandos ploy) | "**Promote** a norm to a crit" | Attack |
| **FailsToNorms** (calculator input) | "Modified to normal successes" | Both |

---

## Which effects are blocked by a locked dice

These are the retention-worded promotions. In the calculator they draw **only** from normal
successes that came off the dice.

| Effect | Where |
|---|---|
| **Rending** | Attack |
| **NormsToCrits** (calculator input) | Both — this is the one that hits cover saves on defence |
| **Mystic Scry**, norm→crit half | Attack |

---

## How the calculator models it

The engine keeps a count of how many of your normal successes are already retained, alongside the
normal successes themselves. Every retention-worded promotion is offered only
`norms − retainedNorms` as legal targets. Everything lives in one shared step
(`applyPostRollModifications`), so the exact Shoot calculator and the Monte Carlo Fight calculator
behave identically here.

One refinement worth knowing about: when a **change**-worded effect (Severe, Waaagh) consumes a
normal success, the engine deliberately spends a **retained** one first. This is never worse for
you and is sometimes better, because it leaves your rolled dice available for any retention-worded
promotion that comes afterwards. It is not extra generosity — it is what a player who understood
the interaction would do.

---

## Worked examples

**Cover save vs NormsToCrits.** You are in cover (1 automatic normal save) and have a rule letting
you retain a normal save as a critical save. One critical hit is coming in.

- The cover save is retained. It cannot be promoted.
- You are holding 1 normal save. A single normal save cannot cancel a critical hit (that takes two).
- **Result: the hit goes through.**

**Rolled save vs NormsToCrits.** Same rule, but the normal save came off a die you actually rolled.

- The save is promotable. It becomes a critical save.
- A critical save cancels a critical hit.
- **Result: the hit is cancelled.**

**Both at once.** One cover save, one rolled normal save, one promotion available. The promotion
goes to the rolled save — it is the only legal target. You end up holding 1 critical save and 1
normal save.

**Punishing then Rending.** You retain 1 critical hit and 1 fail.

- Punishing retains the fail as a normal hit. That dice has now been retained.
- Rending asks to retain a normal hit as a critical instead — but the only normal hit you have is
  the Punishing one, already retained.
- **Result: 1 critical + 1 normal.** Not 2 criticals.

Taking Punishing is still right here: declining would leave you with the critical hit alone. It
stops being right only when something else can turn that same fail into a *promotable* norm — see
the optional-rules section below.

**Severe ordering.** You have 1 rolled normal success and 1 Accurate normal success, plus Severe
and one NormsToCrits promotion, and no criticals.

- Severe changes the **Accurate** success to a critical (change-worded, so it may).
- That leaves the rolled success free for the NormsToCrits retention.
- **Result: 2 criticals.** Had Severe taken the rolled success instead, the Accurate one would be
  unpromotable and you would end at 1 critical + 1 normal.

---

## Optional rules the calculator decides for you

Five of these effects are **optional**. Punishing, Mystic Scry, Severe, and Rending say "you
*can*", and Accurate lets you retain "*up to* x", so taking them is a choice and not always the
right one. The calculator resolves every line and keeps whichever ends better, deciding in the
dice step exactly as a player must.

**Punishing.** With 1 critical hit and 1 fail, Rending, and FailsToNorms 1:

- **Taking it:** the fail becomes a locked norm, leaving FailsToNorms nothing and Rending no legal
  target → 1 critical + 1 normal (7 damage at 3/4).
- **Declining it:** FailsToNorms converts the fail to a *promotable* norm and Rending promotes it →
  2 criticals (8 damage).

The calculator declines. Whenever nothing else wants the fail, it takes the retention as usual.

**Severe.** "You can change one of your normal successes to a critical success" when you retained
no crits. One die at 2+ with normal 5 and crit 3 deals about 3.83 with Severe off, and 2.5 if
every success is turned into a crit. The calculator declines that conversion: two normals stay two
normals (10, not 8). Devastating counts toward the crit. On a shoot the score is expected damage
after saves, cover, and Piercing Crits, so a cover save plus Piercing Crits 1 can make the smaller
raw crit the right take. When Severe does fire, Rending stays blocked on that line.

**Rending.** "You can retain one of your normal successes as a critical success" when you already
have a crit. One crit and one normal at 5/3 stay as they are (8, not 6) unless a save makes the
second crit better: one normal save blocks the normal and cannot block a crit, so 6 gets through
instead of 3. Devastating can also make the conversion worth taking. A retained normal (Accurate,
cover, Punishing) is still not a legal target. Ties still convert. Rending already requires a crit,
so Piercing Crits is on for both lines; it is Severe, which creates the first crit, where Piercing
Crits changes the defence dice between the take and the decline.

**Mystic Scry.** Retain one fail as a normal success, *or* one normal success as a critical success,
or decline. The norm→crit half needs a norm that isn't already retained, and the fail→norm half
produces a locked norm that Rending then can't promote — so the calculator scores all three lines
through the remaining steps and keeps the best. Its own page, `/notes/mystic-scry-buff`, works
through the Rending interaction.

**Accurate.** The rule is "retain **up to** x dice", so retaining fewer is legal. A retained dice is
locked, while rolling it can produce a critical success or a promotable norm. With one die at 2+ and
a spare norm→crit promotion, rolling is worth 3.33 damage against a retained norm's 3.00 — so the
calculator rolls. It keeps the maximum whenever that is at least as good, which is the usual case.

---

## Known modelling limitations

**Cover saves are always taken.** Cover is optional in the same way Accurate is, but ranking the
choice properly needs the incoming hit profile — a normal save is worth half a critical save only
against critical hits — which the dice step cannot see. It is a narrow corner: measured against a
normal attacker, cover wins at every save value and every promotion count, and declining only pulls
ahead once you hold norm→crit save promotions *and* most of the incoming hits are critical.
[When Not to Take Cover Saves](/rules/cover-saves) has the numbers and the workaround.

**Accurate is ranked on pre-save damage.** How many Accurate dice to retain is decided before the
roll, from the damage those dice would deal, without the defender's saves or Piercing. **Punishing,
Mystic Scry, Severe, and Rending are decided per roll.** On a shoot, each candidate is scored by
its expected damage against that defender's saves, cover, and Piercing, and Devastating is part of
the crit's value; with no defender, and in a fight, they fall back to pre-save damage. For save
dice, where there is no damage to score, the fallback counts a critical save as two normal saves.
The shoot score includes saves, cover, and Piercing, and does not include Feel No Pain or Saintly
Relics.

**FailsToNorms is treated as a change, not a retention.** The generic input is worded as a
modification, so the norms it produces stay promotable. If your rule is worded "retain one of your
fails as a normal success", the resulting dice should be locked instead. **Punishing** is the
locked-and-modelled version, but note it is conditional: it only triggers when you have at least
one critical success, and it is switched off entirely by an Obscured target. An *unconditional*
retention-worded fail rescue therefore has no exact representation right now — FailsToNorms will
slightly overstate it on rolls where the resulting norm goes on to be promoted.

---

## Quick reference

| Calculator input / ability | Produces a locked dice? | Blocked by a locked dice? |
|---|---|---|
| Cover Saves | Yes | — |
| Accurate (AutoNorms) | Yes | — |
| AutoCrits | n/a (already critical) | — |
| Punishing | Yes | — |
| FailsToNorms | No | — |
| NormsToCrits | — | Yes |
| Rending | — | Yes |
| Mystic Scry (norm→crit half) | — | Yes |
| Mystic Scry (fail→norm half) | Yes | — |
| Severe | — | No |
| Waaagh! (KT2021) | — | No |
