# KT Companion 1.0.2 validation

This update adds the home menu entry **КТ Калькулятор / KT Calculator** and
mounts Combat Lab at `/combat` on the existing Companion server. It also fixes
wrapped ranks, ratings and member counts in player/team leaderboards.
Application, both package/lockfile pairs and Companion asset versions are 1.0.2.
No dependencies, database migrations or required environment settings changed.

## Verification

The mounted production build (`npm run build:combat`) and nested TypeScript
check passed. JavaScript syntax and Git whitespace checks passed. Real browser
checks covered menu navigation, shooting and melee workers, saved/shared scenario
reloads, rule documents, the home link and RU/EN mobile menu labels.

- Four/five shooting attacks yielded 3.29/5.04 average damage; the other profile
  remained at 3.29.
- Vespid vs Plague Marines yielded 3.25 damage; adding the enabled Neutron Charge
  rule changed it to 4.29. Reloading the shared `/combat/simulation` URL retained
  the profiles and enabled rule.
- Public HTML, health and catalogue returned HTTP 200. Missing assets/API routes
  returned 404, malformed paths 400, encoded traversal 403, unsupported methods
  405; HEAD returned no body.
- Leaderboard rank 140 wrapped across two lines before the change and occupied
  one line afterward. Ranks 140/1000, ratings 1456/12345 and member counts stayed
  on one line at 320, 390, 768 and 1440 px without page overflow.

Evidence remains under ignored `services/combat-lab/verify-artifacts/combat-menu`
and `work/leaderboard-numbers` in the MMR KIT verification copy. Public UI checks
used an isolated harness; accounts and PostgreSQL were not exercised. The prior
1.1.0 main merge passed all 1036 tests. Automated suites were not rerun for this
standalone commit/push, following AGENTS.md. Local servers and databases remain off.

## Deployment

Push and deployment are separate steps. On the existing production server,
update the repository and invoke the updated script from that repository:

```sh
git -C /app/Repos/tgtv-tournament-system pull --ff-only origin main
bash /app/Repos/tgtv-tournament-system/update_tgtv-ts.sh production
```

The root `npm ci --omit=dev` runs postinstall to prepare `build-companion` before
PM2 starts. It reuses an unchanged, intact build and installs/builds Combat Lab
only when needed. The updated script preserves the build directory and its
fingerprint during rsync. Use the script from the updated repository: external
copies must also preserve `/services/combat-lab/build-companion/` to reuse it.
Existing builds without a fingerprint are rebuilt once on this upgrade.
After deployment, verify `/`, `/combat`, `/combat/simulation`, `/combat/api/health`
and `/api/session` on the public host. Source PDFs remain optional and require
`COMBAT_REFERENCE_DIR`; the bundled catalogue and calculations work without them.

## Production install follow-up

On 12 October, the public server served the updated menu and catalogue API but
`/combat` returned 503 because its compiled page was unavailable. The original
health response incorrectly reported success without checking the build.

The repair adds the nested install/build to the root npm postinstall lifecycle.
A fresh MMR KIT checkout with `NODE_ENV=production` completed the exact legacy
deploy command `npm ci --omit=dev`; nested build tools were included and the
production build completed successfully. Root and nested dependency graphs did
not change. The deployment script avoids running the build twice.

A temporary public-UI harness initially returned health 503 with no build, then
served `/combat`, `/combat/simulation` and health with 200 after installation.
Removing either HTML or the asset manifest made health return 503; restoring
files restored 200 without restarting the process. Browser workers reproduced
3.29/3.29 baseline, 5.04/3.29 after changing only profile A, and 3.25 in the Vespid
simulation, with no page errors. Evidence is in ignored
`services/combat-lab/verify-artifacts/install-fix`; the complete installer log is
`work/production-install.log`. No database was started. Automated suites were
not run for this standalone fix/push, following AGENTS.md.

For immediate repair on an already updated server, run from `/app/tgtv-ts`:

```sh
npm ci --prefix services/combat-lab --include=dev --ignore-scripts
npm run build:combat
```

The running server picks up the generated files without a restart. The next
normal root install/update checks the fingerprint and performs these steps only
when necessary. `npm run build:combat` remains a forced rebuild.

## Incremental Combat Lab builds

The postinstall hook now reuses a build only when both its input and output
fingerprints match. Source or dependency changes, missing/modified assets and
an invalid stamp all invalidate the cache. Release-number-only bumps in both
package/lockfile pairs leave the calculator cache valid.

In the MMR KIT verification copy, an actual production root install rebuilt
after a build-input change and completed successfully. A subsequent
`NODE_ENV=production npm ci --omit=dev --no-audit --no-fund`, with a temporary
Studio CSS edit and version-only changes in both packages/lockfiles, completed
in **1.3 seconds**. Its log confirmed both the nested install and build were
skipped; compiled HTML and nested react-scripts timestamps stayed unchanged.
Temporary verification edits were restored byte-for-byte. Direct cache checks
confirmed invalidation after calculator source/dependency edits, a changed or
missing compiled JS asset and a corrupt stamp; restoring the files restored
cache validity.

The production build was then served through the real public HTTP handlers in
an isolated harness. Home, calculator, simulation, health and catalogue returned
200. Real browser workers produced 3.29/3.29, then 5.04/3.29 after increasing
profile A's attacks; the Vespid simulation produced 3.25. No page errors were
reported. Screenshots and result transcripts are in ignored
`services/combat-lab/verify-artifacts/incremental-build`; installer logs are in
`work/incremental-install-*.log`. Node and deployment-shell syntax checks passed.
Full PM2/rsync deployment was not executed locally. Automated test suites were
not run for this standalone fix/push, following AGENTS.md. No database was
started; the private verification server was stopped after these checks.
