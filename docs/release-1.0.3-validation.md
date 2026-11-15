# KT Companion 1.0.3 validation

Release 1.0.3 includes all changes after tag 1.0.2: production preparation of
Combat Lab, honest build readiness, reuse of unchanged builds and the Companion
browser icon. Application and Combat Lab package versions, both lockfiles and
Companion asset query versions are 1.0.3. Dependency graphs are unchanged.

## Build behaviour and verification

Root `npm ci` runs the Combat Lab preparation hook. It compares only calculator
build inputs and the completed output fingerprint; unrelated Companion modules
are outside that input set. Updating Studio, dice, tournaments, FAQ, initiative,
the activation tracker, the home menu or the shared server was verified to skip
both the nested installation and compilation. Source/dependency changes and
missing, changed or corrupt build assets invalidate the cache. Release-number
changes alone do not invalidate it, including both package/lockfile pairs.

The implementation's production install/build and real browser verification are
recorded in [the 1.0.2 follow-up validation](release-1.0.2-validation.md).
Real workers produced 3.29/3.29 at baseline, 5.04/3.29 after increasing profile A's
attacks, and 3.25 in the Vespid simulation. The favicon follow-up verified that
both routes reference the new Companion icons, that the PNG loads at 32x32, and
that all icon responses are byte-identical to the main site's brand assets.
HTML, health and icon responses returned 200; no browser page errors occurred.

Ignored evidence is in `services/combat-lab/verify-artifacts/incremental-build`
and `services/combat-lab/verify-artifacts/favicon` in the MMR KIT verification
copy. Automated test suites are reserved for merges into main by AGENTS.md and
were not rerun for this release commit/push. No database migrations or data
changes are part of this release.

For the final 1.0.3 metadata, `NODE_ENV=production npm ci --omit=dev --no-audit
--no-fund` completed in **1.39 seconds** and explicitly skipped Combat Lab's
nested install and build. Comparing both package/lockfile pairs with the prior
commit confirmed that only version fields changed. All seven service roots,
the simulation, build health, Companion icon and sampled versioned shared
assets returned 200 through the real public handlers. Non-Combat HTML used
asset version 1.0.3. These were private HTTP checks with no database or account
flows. Evidence is in ignored `verify-artifacts/release-1.0.3` under Combat Lab
and `work/release-1.0.3-*.json` / `work/release-1.0.3-install.log`. The verification
server was stopped afterward.

## Deployment

On the existing server, use the updated script from the repository:

```sh
git -C /app/Repos/tgtv-tournament-system pull --ff-only origin main
bash /app/Repos/tgtv-tournament-system/update_tgtv-ts.sh production
```

The script preserves `services/combat-lab/build-companion/`, including its
fingerprint stamp, during rsync. Existing unstamped builds are rebuilt once on
upgrade. Old external scripts must preserve this directory too to reuse builds.
After deployment, check `/`, `/combat`, `/combat/simulation`,
`/combat/api/health` and `/api/session`. Source PDF configuration stays optional.
Pushing the release does not update the running server by itself.
