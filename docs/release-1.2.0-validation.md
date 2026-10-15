# KT Companion 1.2.0 validation

This release collects all unpublished working-copy changes on top of 1.1.1:
private BCP profile email, leaderboard search, captain and faction editing,
current member nicknames, shared Companion/Combat Lab navigation and profile
game-card layout fixes.

## Packaging and database

Application and Combat Lab packages, both lockfiles and client asset markers
use 1.2.0. The dependency graphs are unchanged. No new environment variables
are required. Migration 054_user_bcp_email follows migration 053 and adds a
nullable users.bcp_email column with a 254-character limit. Startup applies
the migration automatically.

Environment files, sessions, preview helpers, dependencies, database contents,
screenshots and logs remain in ignored runtime directories.

## Release checks

- JavaScript syntax checks passed for all 19 changed or new JavaScript files.
- Git whitespace checks passed; package and lockfile versions agree.
- `npm run build:combat` compiled successfully in the canonical MMR KIT local
  working copy. The production build targets /combat. Existing toolchain
  deprecation and Browserslist warnings do not prevent the build.
- Automated suites were not run: AGENTS.md permits them only as part of
  merging changes into main, and this release is a standalone commit and push.

## Browser and API verification

Verification used a local-only preview on 127.0.0.1:3006 and the dedicated
PostgreSQL database bcp_profile_preview. The configured production-copy
database was not used. A normal LocalPreviewAdmin session supplied local
autologin. Static HTML and /api/me returned 200, user.isAdmin was true, and
the admin session survived page refresh.

The verify-ktcalc skill was applied to the actual integrated production build.
Its old standalone launcher assumes the former ktcalc package name and dev
start command; the documented browser steps were adapted to the current
/combat routes and explicit Calculate button without changing React state
or calling calculator engine functions.

Shooting evidence:

| Readout | Before | After pressing Attacks + and Calculate |
| --- | --- | --- |
| Situation 1 attacks | 4 | 5 |
| Situation 1 average damage | 3.29 | 5.04 |
| Situation 2 average damage | 3.29 | 3.29 |

The shared account and navigation worked on calculator, fight, simulation,
help and weapon-rules routes. The service title opened the calculator and
the logo opened Companion home. The mobile header fit a 390px viewport.
RU/EN and light/dark controls worked; preferences persisted into the
tournament profile. No browser page errors occurred.

The release preview also confirmed the BCP profile form, nickname search in
the leaderboard and absence of bcpEmail in public leaderboard responses.
Earlier BCP verification on the same isolated database covered save, reload,
normalization, clearing, invalid values, unrelated profile updates, separate
sign-in email and privacy in another player's profile. Desktop and mobile
profile layouts were visually inspected in both languages and themes.

Ignored release evidence in the canonical runtime:
services/combat-lab/verify-artifacts/release-120/shoot-before.png,
shoot-after.png, shoot-result.json, combat-mobile-ru-dark.png,
profile-mobile-ru-dark.png and release-result.json. Earlier profile evidence
is under work/bcp-profile-*.png. Release preview logs are under
work/server-3006.out.log and work/server-3006.err.log.

The release verification browser and its temporary server are stopped after
verification. Existing previews and database data are retained. Publishing
the Git commit and tag does not itself restart the production server.

## October 15 update: melee rules and deployment

The 1.2.0 changelog also includes the venue-address changes already merged into
main, the current melee calculator changes and the Linux release deployment
workflow. The package version remains 1.2.0; the existing v1.2.0 tag is retained.
Migration 055_tournament_venue_address belongs to the previously merged venue
changes. The melee and deployment changes add no dependencies or migrations.

The requested melee verification was completed during implementation:

- TypeScript checking and the production build passed in the MMR KIT runtime.
- All 43 new-rule scenarios passed, including all 16 Stealth Assault
  strike/block and normal/critical combinations. The selected melee regression
  run passed 135 cases, including those 43; the restored Shock selection passed
  24 cases, and the strategy comparison sweep passed.
- Common dice, Monte Carlo dice, controls, notes and shared-URL checks passed.
- The real browser verified the Advanced controls, changed fight results for
  MinDmgToSelf versus MaxDmgToEnemy, and restored all selected rules and
  Devastating from a shared URL. Shooting changed from 3.29 to 5.04 average
  damage after one extra attack while the second profile remained at 3.29.
- The 390px mobile viewport had no document overflow. Rules pages loaded and
  the browser reported no console errors. Local administrator autologin and
  /combat/api/health were verified at http://127.0.0.1:3011.

Ignored evidence is under services/combat-lab/verify-artifacts:
melee2024-result.json, melee2024-before.png, melee2024-after.png,
melee2024-mobile.png and melee2024-shoot-smoke.png. The local preview remains
available for the user.

Tactical lookahead uses expected prevention for FNP and Saintly Relics; live
simulations roll those effects. Users must enable conditional abilities only
when their game prerequisites apply. Cross-fight CP and turning-point limits
are not tracked by a single fight calculation.

This standalone commit/push does not repeat automated suites, in accordance
with AGENTS.md. Before this push, syntax checks passed for the five changed/new
JavaScript files and the Bash deployment wrapper; Git whitespace checks passed.
All four package/lockfile versions were confirmed as 1.2.0. All 27 changed
calculator files matched the verified runtime copy. The local home page, fight
page and calculator health endpoint returned 200, with buildReady true.

The Linux/PM2 deployment switch has not been exercised on the
production host; its preparation, cache and recovery behavior is documented
in deployment.md. Pushing main does not run that deployment script.
