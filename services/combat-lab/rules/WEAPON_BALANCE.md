# Comparing Weapons by Power Level

"Are these weapons about the same power level?" is a question the calculator can answer properly,
because both engines already do the hard part: resolve a real profile against a real target and
report what happens. This page shows the method, the measured numbers for the KT24 heavy weapon
lists, and the sets that came out balanced — including what the model does *not* count, which
matters as much as what it does.

The numbers here are produced by a harness in the test suite, not by hand. Anyone can re-run it and
get the same values — see [Reproducing this](#reproducing-this) at the bottom.

---

## The method

**One weapon, one slate of targets.** Comparing two weapons against a single target says very little:
the answer flips depending on the target's save and wound count. Every weapon here is scored against
the same five defenders, chosen to span the profiles a kill team actually meets:

| Target | Melee profile | Shooting profile |
|---|---|---|
| Horde | 3 dice, 5+, 2/3 damage, 7 wounds | Save 5+, 7 wounds, no cover |
| Chaff | 3 dice, 4+, 3/4 damage, 8 wounds | Save 4+, 8 wounds, no cover |
| Trooper | 3 dice, 4+, 4/5 damage, 10 wounds | Save 4+, 10 wounds, in cover |
| Marine | 4 dice, 3+, 4/5 damage, 13 wounds | Save 3+, 13 wounds, no cover |
| Elite | 5 dice, 3+, 5/6 damage, 15 wounds | Save 3+, 15 wounds, in cover |

Melee defenders need a full operative profile because they fight back; shooting defenders need a
save, a wound count, and whether they hold cover.

**Melee is scored as a fight, not as output.** A melee weapon that deals big damage while eating a
parry-heavy counterattack is not the same as one that wins clean, so melee runs through the Fight
engine as a real one-round combat: both fighters set to Max Damage, alternating strike and parry
(see [Fight rules](/rules/fight)). The carrier is fixed at 13 wounds for every weapon, so the
comparison is between weapons rather than between operatives. Three things get recorded: expected
damage dealt, expected damage taken, and the chance the target is reduced to 0 wounds. The Fight
engine is Monte Carlo, so the harness pins the simulation count (40,000) and the seed (24601) —
re-running reproduces the published numbers exactly instead of landing near them.

**Shooting is exact.** The Shoot engine enumerates every attack-and-save outcome, so no sampling is
involved: expected damage and kill chance are computed, not estimated. Cover, Piercing, and
Devastating are modeled as the engine handles them ([Combat rules](/rules/combat)). Saturate is
represented by setting cover saves to 0.

**Kill chance is the headline number for melee, damage for shooting.** In a fight, killing the enemy
is what stops the counterattack, so kill chance is the outcome that decides games. A shooting attack
is one-directional and usually part of a turn's worth of fire, so expected damage is the fairer
summary; kill chance is reported alongside it.

**The buff is scored too.** A set that is balanced plain can come apart the moment a team upgrade
lands on it, so every weapon is scored twice: as printed, and with the buff that upgrades it. For
melee that is Paired Weapon (+1 Atk); for shooting, Twinned (Ceaseless, or +1 Atk on a Burst
Cannon). Three spreads then matter, not one:

- **plain spread** — how even the weapons are as printed;
- **buffed spread** — how even they are once everyone is upgraded;
- **gain spread** — how differently the buff treats them.

A set can look even and still be broken, if the buff is worth twice as much on one member as on
another. That is the failure the third number catches.

---

## Melee results

Ten profiles, one round of combat, averaged over the five defenders. Kill chance is the chance the
target is reduced to 0 wounds.

| Weapon | Kill % | With +1 Atk | Gain | Damage dealt | Damage taken |
|---|---|---|---|---|---|
| Scything Talons | 85% | 92% | +6.8 | 10.2 | 5.0 |
| Flesh Mower | 81% | 89% | +7.7 | 10.1 | 5.4 |
| Power Fist | 77% | 88% | +10.7 | 9.7 | 4.5 |
| Power Scourge | 77% | 85% | +7.7 | 9.7 | 5.2 |
| Thunder Hammer | 76% | 87% | +10.9 | 9.6 | 4.6 |
| Power Weapon | 72% | 84% | +11.8 | 9.4 | 5.1 |
| Chain weapon | 72% | 85% | +12.8 | 9.3 | 5.6 |
| Power Talon | 71% | 84% | +12.9 | 9.3 | 5.5 |
| Dread Saw | 71% | 80% | +9.4 | 9.5 | 5.6 |
| Close Combat Weapon | 24% | 38% | +14.3 | 5.7 | 7.0 |

Three things fall out of this table:

- **Scything Talons and Flesh Mower have no bad matchup.** Ceaseless on 5 dice, and hitting on 2+,
  put them above everything else against hordes *and* against Marines. Nothing in the list can be
  balanced against them.
- **Close Combat Weapon is the baseline, not a peer.** At 24% it is less than half of the next
  weapon up. It is what a weapon looks like with no rules attached.
- **+1 Atk is a flat buff.** Every real weapon gains 7 to 13 points. That is what makes a
  buff-resistant set possible here; a percentage-style buff would not behave so evenly.

### Recommended melee set

**Power Scourge, Thunder Hammer, Chain weapon, Power Weapon, Power Talon.** Kill chance plain →
with +1 Atk:

| Weapon | Horde | Chaff | Trooper | Marine | Elite | Average |
|---|---|---|---|---|---|---|
| Power Scourge | 96% → 98% | 96% → 98% | 88% → 94% | 69% → 81% | 37% → 53% | 77% → 85% |
| Thunder Hammer | 91% → 96% | 89% → 95% | 87% → 94% | 67% → 82% | 47% → 68% | 76% → 87% |
| Chain weapon | 88% → 95% | 86% → 94% | 86% → 94% | 54% → 74% | 45% → 66% | 72% → 85% |
| Power Weapon | 94% → 97% | 86% → 94% | 86% → 94% | 54% → 72% | 42% → 63% | 72% → 84% |
| Power Talon | 88% → 95% | 86% → 94% | 86% → 94% | 53% → 74% | 44% → 65% | 71% → 84% |

Spreads: **5.8 points plain, 3.1 buffed, 5.1 on the gain.** The set gets *tighter* when Paired
Weapon is in play, because the weapon slightly ahead of the pack (Power Scourge, already at 6 dice)
is the one with the least room to gain.

The set also keeps distinct roles, which is the point of a balanced set rather than five copies of
one weapon: Power Scourge is the horde eater (96% into 7-wound models, 37% into Elites), Thunder
Hammer is the elite killer (47%, the best in the set), and the other three are generalists within a
point of each other.

---

## Shooting results

Twenty-five profiles, one shooting attack, averaged over the five defenders. Supercharge profiles
are used where a weapon has one.

| Weapon | Damage | With buff | Gain | Kill % |
|---|---|---|---|---|
| Thermal Spear | 14.5 | 20.2 | +40% | 65% |
| Heavy Rail Rifle | 14.4 | 20.2 | +40% | 64% |
| Macro Plasma Incinerator (supercharge) | 12.5 | 17.1 | +37% | 60% |
| Splinter Cannon | 10.5 | 14.8 | +40% | 48% |
| Meltagun | 10.3 | 14.8 | +43% | 48% |
| Multi-melta | 10.3 | 14.8 | +43% | 48% |
| Lascannon | 10.3 | 14.7 | +43% | 47% |
| Heavy Onslaught Gatling Cannon | 10.0 | 14.1 | +41% | 49% |
| Flamestorm Cannon | 9.8 | 12.2 | +25% | 44% |
| Heavy Bolter | 9.3 | 12.9 | +38% | 45% |
| Autocannon | 9.2 | 13.3 | +45% | 44% |
| Plasma Cannon (supercharge) | 9.1 | 12.7 | +39% | 41% |
| Plasma Gun (supercharge) | 9.1 | 12.7 | +39% | 41% |
| Starcannon | 9.1 | 12.7 | +39% | 41% |
| Cyclic Ion Raker | 8.6 | 12.2 | +42% | 42% |
| Shuriken Cannon | 8.5 | 11.8 | +39% | 42% |
| Heavy Phosphor Blaster | 8.3 | 11.5 | +40% | 39% |
| Burst Cannon | 8.2 | 10.8 | +31% | 37% |
| Missile Launcher (krak) | 7.9 | 11.4 | +46% | 36% |
| Heavy Flamer | 7.8 | 9.8 | +26% | 32% |
| Heavy Stubber | 7.4 | 10.7 | +45% | 35% |
| Rocket Launcher | 6.7 | 10.1 | +51% | 31% |
| Stranglethorn Cannon | 5.6 | 8.0 | +44% | 24% |
| Havoc Launcher | 5.4 | 8.0 | +49% | 25% |
| Missile Launcher (frag) | 4.2 | 6.3 | +49% | 15% |

Worth noticing:

- **Plasma Cannon, Plasma Gun and Starcannon are the same weapon on paper** — 4 dice, 3+, 5/6,
  Lethal 5+, Piercing 1 — and produce identical single-target numbers. Their differences are Blast,
  Heavy, and Hot, none of which show up in a single-target comparison.
- **Thermal Spear and Heavy Rail Rifle sit 40% above the pack.** Like Scything Talons in melee, they
  cannot be balanced against the rest of the list.
- **Ceaseless is worth roughly +40% damage across the board.** The exceptions are the weapons that
  already hit on 2+ or already reroll: Flamestorm Cannon (+25%), Heavy Flamer (+26%), and Burst
  Cannon (+31%, since Twinned gives it +1 Atk instead).

### Recommended shooting set

**Heavy Bolter, Autocannon, Starcannon, Shuriken Cannon, Heavy Phosphor Blaster, Missile Launcher
(krak).** Expected damage, plain → with Ceaseless:

| Weapon | Horde | Chaff | Trooper | Marine | Elite | Average |
|---|---|---|---|---|---|---|
| Heavy Bolter | 11.4 → 15.0 | 10.1 → 13.7 | 8.4 → 11.9 | 8.9 → 12.4 | 7.8 → 11.2 | 9.3 → 12.9 |
| Autocannon | 12.4 → 16.9 | 10.2 → 14.4 | 8.2 → 12.2 | 8.1 → 12.1 | 6.9 → 10.7 | 9.2 → 13.3 |
| Starcannon | 11.2 → 15.1 | 9.9 → 13.6 | 8.3 → 11.8 | 8.6 → 12.1 | 7.7 → 11.1 | 9.1 → 12.7 |
| Shuriken Cannon | 10.8 → 14.4 | 9.2 → 12.6 | 7.8 → 11.0 | 7.7 → 10.9 | 6.9 → 10.0 | 8.5 → 11.8 |
| Heavy Phosphor Blaster | 10.3 → 13.8 | 8.6 → 11.9 | 8.6 → 11.9 | 6.9 → 10.0 | 6.9 → 10.0 | 8.3 → 11.5 |
| Missile Launcher (krak) | 10.5 → 14.4 | 8.8 → 12.5 | 6.9 → 10.3 | 7.1 → 10.6 | 6.0 → 9.3 | 7.9 → 11.4 |

Kill chance for the same six:

| Weapon | Horde | Chaff | Trooper | Marine | Elite | Average |
|---|---|---|---|---|---|---|
| Heavy Bolter | 83% → 96% | 76% → 94% | 36% → 67% | 26% → 51% | 6% → 18% | 45% → 65% |
| Autocannon | 75% → 92% | 62% → 86% | 49% → 78% | 20% → 42% | 12% → 30% | 44% → 66% |
| Starcannon | 69% → 89% | 60% → 83% | 49% → 76% | 18% → 38% | 11% → 27% | 41% → 63% |
| Shuriken Cannon | 78% → 94% | 68% → 89% | 40% → 63% | 19% → 39% | 6% → 15% | 42% → 60% |
| Heavy Phosphor Blaster | 75% → 92% | 62% → 86% | 36% → 63% | 17% → 35% | 6% → 15% | 39% → 58% |
| Missile Launcher (krak) | 69% → 87% | 51% → 76% | 37% → 65% | 17% → 34% | 6% → 16% | 36% → 56% |

Spreads: **1.5 damage plain, 1.8 buffed, 0.8 on the gain** — the best gain spread available from the
pool once weapons carrying Selection are excluded, since taking an extra weapon slot is a real cost
the dice never show.

Roles inside the set: Heavy Bolter and Autocannon are the horde clearers, Starcannon and Missile
Launcher (krak) are the anti-armor picks, and Heavy Phosphor Blaster is the cover-breaker — Saturate
means its Trooper number is the only one in the set that does not drop when the target takes cover.

Adding a seventh weapon widens at least one spread no matter which is chosen, so six is the natural
stopping point. If a seventh is needed anyway, Heavy Stubber keeps the gain spread at 0.8 while
costing plain spread (1.5 → 1.9); Burst Cannon does the reverse, holding plain spread at 1.5 but
falling behind once buffed, because Twinned treats it worse than everything else in the list.

---

## What this does not measure

The numbers above are a single attack against a single target. Several real sources of value sit
outside that frame, and every one of them favors particular weapons:

- **Blast and Torrent hit extra operatives.** Every number here is single-target, so a Torrent 2"
  weapon is worth more at the table than its row suggests. This is the largest omission on the
  shooting side, and the reason the recommended set was checked for how many of its members carry
  one.
- **Hot can damage the shooter.** Supercharge profiles are scored for what they do to the target
  only.
- **Heavy, Selection, and Range are restrictions with no dice effect.** Heavy limits movement,
  Selection costs an extra weapon slot, Range caps the engagement. A weapon that looks even on
  damage can still be worse to take.
- **Stun, and other rules that hit the next activation.** Thunder Hammer's Stun does nothing to the
  dice in the fight it happens in, so its melee row understates it.
- **One round, one attack, no ploys.** No APL costs, equipment, ploys, or multi-round attrition. A
  weapon that wins the second round is scored the same as one that wins the first.

None of these break the comparison — they are the reason the recommendation names them explicitly
rather than pretending the ranking is the whole story.

---

## Reproducing this

The harness lives in the test suite and is **skipped unless `BALANCE_OUT` is set**, so it costs
nothing in a normal run:

```sh
CI=true BALANCE_OUT=/tmp/balance.json npx react-scripts test --watchAll=false \
  --testPathPattern WeaponBalance
```

It writes one JSON file holding every weapon, plain and buffed, with per-target damage, damage
taken (melee), and kill chance, plus the defender slate and the Fight engine's seed and simulation
count. Editing the profile lists at the top of `src/WeaponBalance.test.ts` re-scores any other set
of weapons the same way.

The same comparison can be done by hand in the calculator for a single matchup: set the attacker,
note the expected damage, change the one input, and compare. That is the approach behind
[When not to take cover saves](/rules/cover-saves), and the same discipline applies here — an
unexplained difference between two profiles is a question to answer, not a result to publish.
