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

This script installs the nested build dependencies and builds `build-companion`
before starting PM2. An older external copy of the script lacks those build steps.
After deployment, verify `/`, `/combat`, `/combat/simulation`, `/combat/api/health`
and `/api/session` on the public host. Source PDFs remain optional and require
`COMBAT_REFERENCE_DIR`; the bundled catalogue and calculations work without them.
