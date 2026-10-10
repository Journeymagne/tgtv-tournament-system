# Verifying an engine change

The calculator's job is to be right about numbers, and its two engines share enough logic that a
change made for one rule can quietly move results for another. Passing tests alone doesn't prove
that didn't happen — tests only cover the cases someone thought to write.

This describes the check that does: run the same scenario sweep on two checkouts and require every
difference to have a named cause. It is reproducible, so nobody has to take a claim on trust.

---

## The differential sweep

Two harnesses live in the test suite but are **skipped unless `SWEEP_OUT` is set**, so they cost
nothing in normal runs:

- `src/DiffSweep.test.ts` — an exhaustive sweep of `applyPostRollModifications` (the post-roll step
  both engines route through) plus a grid over the full exact Shoot pipeline including saves, cover
  and Piercing. It records expected damage *and* total probability mass, so a corrupted distribution
  can't hide behind an unchanged average.
- `src/DiffSweepFight.test.ts` — a grid over the Monte Carlo Fight engine at a fixed seed and fixed
  simulation count, so any difference is a behavior change rather than sampling noise.

### Running it

From the branch under test:

```sh
npx react-scripts test --watchAll=false --testPathPattern DiffSweep \
  --env=node 2>/dev/null   # or just: CI=true SWEEP_OUT=/tmp/new.json npm test -- --testPathPattern DiffSweep
```

Concretely, the two-checkout version:

```sh
# 1. fingerprint the branch
CI=true SWEEP_OUT=/tmp/new.json npx react-scripts test --watchAll=false --testPathPattern DiffSweep

# 2. fingerprint the baseline in a worktree
git worktree add /tmp/base origin/main
ln -s "$PWD/node_modules" /tmp/base/node_modules
cp src/DiffSweep*.test.ts /tmp/base/src/
cd /tmp/base && CI=true SWEEP_OUT=/tmp/old.json npx react-scripts test --watchAll=false --testPathPattern DiffSweep

# 3. diff and classify
```

Then compare `/tmp/old.json` and `/tmp/new.json`. Every differing key is a scenario whose result
moved; the question to answer for each is *which intended change explains it*. Group the keys by the
features they involve, and treat any group you can't name a cause for as a defect until proven
otherwise.

### What a good result looks like

For the retained-once change (PR #27), against `origin/main`:

| Sweep | Scenarios | Differences | Unexplained |
|---|---|---|---|
| Shoot + shared post-roll step | 253,440 | 30,154 | **0** |
| Fight (Monte Carlo, fixed seed) | 256 | 200 | **0** |

Every difference fell into one of four intended behavior changes, and the scenarios touching none of
the changed features were **bit-identical** to the baseline. Probability mass summed to exactly 1.0
on every Shoot row.

That last check is the one worth insisting on. A large diff count is fine and expected when you have
deliberately changed a rule; an *unexplained* diff, or drift in the untouched control set, is not.

---

## What the sweep does not prove

It proves the change did nothing you didn't intend. It says nothing about whether what you intended
is right. That needs separate evidence, and for an engine change it's usually:

- **Independent derivation of any new maths.** Enumerate the expectation by hand (or in a scratch
  script) *before* writing the code, and assert the code reproduces it. Where a formula composes two
  effects, enumerate the joint case rather than assuming they multiply.
- **Mutation testing.** Revert each fix in place and confirm its tests fail. A test that passes with
  and without the fix is a positive control, not coverage — label it as such so nobody mistakes it
  for protection.
- **A human reading the actual rule.** Wording is load-bearing in Kill Team: "retain … instead"
  and "change" behave differently, and no amount of testing recovers a misread rule.

---

## Checking a specific matchup by hand

The calculator is also its own oracle for questions like "is this ability worth taking?" — set the
input, note the expected damage, change the one input, compare. That is how the guidance in
[`rules/COVER_SAVES.md`](rules/COVER_SAVES.md) was produced, and it corrected a rule of thumb that
had been asserted from reasoning alone and turned out to be wrong.
