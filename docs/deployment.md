# Linux release deployment

Run the existing entry point on the Linux host as the same user that owns the
app's PM2 process. It requires Node.js 22+, npm, Git, tar, flock and PM2. The
external environment file must exist before starting. No new application
environment variables or database migrations are required by this change.

```sh
bash update_tgtv-ts.sh production
bash update_tgtv-ts.sh staging
bash update_tgtv-ts.sh staging --prepare-only
```

Production uses `main`, `/app/Repos/tgtv-tournament-system`, `/app/tgtv-ts`,
`tgtv-app` and `/app/tgtv-ts.env`. Staging uses `feat/tournament-system-mvp`,
the `-staging` directories/process and `/app/tgtv-ts-staging.env`.

The script requires a clean repository, fetches the selected branch and accepts
only a fast-forward to the exact remote commit. Only committed files enter a
release (`git archive`); ignored local files are not deployed. The wrapper holds
an OS lock across the whole operation. Do not invoke `scripts/deploy-release.js`
directly. For the first upgrade, update the copy of `update_tgtv-ts.sh` used on
the host too: an old copy still uses the old stop/install/start sequence.

## Preparation and switch

1. Create a timestamp/commit release directory. Read the external `.env` as data,
   copy it with mode `0600`, and set `NODE_ENV=production`.
2. Copy the previous calculator build. Install the small root dependency set
   with `npm ci --omit=dev --ignore-scripts`, then run root `postinstall` once.
   The live release's dependencies and build files are never modified.
3. Validate server module imports, configuration, static pages and the complete
   calculator build fingerprint. This does not start a server, connect to the
   database, run migrations or send email.
4. For a normal deployment, stop the named PM2 process, switch the current
   symlink and start the candidate by its absolute `server.js` path and cwd.
5. For up to 60 seconds, check `/`, `/api/me`, `/combat` and
   `/combat/api/health` against the local listener. With `COMPANION_ORIGIN`,
   requests use its host header to avoid canonical-host redirects. Check HTML,
   JSON, calculator readiness, the `X-KT-Release` response header and PM2's
   script path. Only then save the PM2 process list.

`--prepare-only` performs steps 1–3 and leaves the app running. It still updates
the repository, installs/builds and writes the candidate/cache, but does not
switch the app or run migrations. A later normal deployment prepares its own
release; it does not implicitly activate an earlier prepared directory.

This removes install/compile time from downtime. The single PM2 fork process
still has a short restart gap, plus the time needed for startup migrations.
It is not a zero-downtime/cluster deployment. Custom PM2 cluster setups are
rejected before stopping anything. This wrapper owns the fork process settings
(Node interpreter, 10-second shutdown grace, automatic restart and log paths);
move any required application settings into the external `.env` before adopting
it. Nginx, PostgreSQL and other PM2 processes are not reconfigured.

## Files and caches

For production, the resulting layout is:

```text
/app/tgtv-ts                         -> current release
/app/tgtv-ts-releases/<id>/          source, .env, node_modules, build, .release.json
/app/tgtv-ts-releases/legacy-<id>/   preserved original app directory
/app/tgtv-ts-shared/work/           shared runtime files and PM2 logs
/app/tgtv-ts-cache/<fingerprint>/    calculator node_modules snapshot
/app/tgtv-ts.env                    external configuration for the next release
/app/tgtv-ts.update.lock            lock file (lock released automatically on exit)
```

On the first switch, the old physical app directory becomes `legacy-<id>`;
its existing `work/` is moved to shared storage after the old process stops.
Old and new releases use a shared `work` link. Other legacy files stay in the
preserved directory. Persistent application data remains in PostgreSQL.
Store external resources such as `COMBAT_REFERENCE_DIR` outside release folders.

The build cache includes input and output hashes, so a missing/corrupt artifact
rebuilds. The dependency cache is separate: package/lockfile contents (excluding
only release version fields), Node/npm version, OS/architecture and npm options
form its key. A stamp checks installed direct package versions and npm's hidden
lockfile before reuse. It is not a full integrity scan of every installed file.
Dependencies are copied, never hard-linked/shared across writable releases.
The first required build after this upgrade creates a dependency stamp/cache.

Nothing prunes releases, failed preparations or cache versions automatically.
Budget disk space for a candidate, previous releases and cached build tools.
Remove obsolete directories only after checking the current symlink and keeping
the desired recovery release; never remove the shared directory or external env.
The new PM2 logs are `tgtv-ts-shared/work/tgtv-app.out.log` and `.err.log`.
Historical PM2 logs remain at their previous location.

## Failure and recovery

Preparation errors leave the running app untouched. `.release.json` records the
phase and previous release path, without environment values or credentials.

After switching, startup/readiness failure restores the previous release and
its environment automatically **only if migration files and the migration
runner are identical**. A failure before starting the candidate can also restore
the previous release, since candidate migrations have not run. A failed deploy
still exits nonzero even when recovery succeeds.

When migration code differs, candidate startup may already have committed some
migrations. The script stops the failed candidate, records
`manual-recovery-required`, and does not start older code against that schema or
restore database data automatically. Keep the usual verified PostgreSQL backup
before deployments involving migrations. Inspect the named process's logs,
the candidate's `.release.json` and the database migration state, then deploy a
forward fix or perform a reviewed recovery compatible with that schema.

If readiness succeeds but writing deployment state or `pm2 save` fails, the
healthy process remains running; fix the persistence problem and run `pm2 save`.
If automatic recovery itself fails, the script reports `recovery-failed`; inspect
PM2 and both release directories before taking further action. SIGINT/SIGTERM
use the recovery path during switching. Power loss or SIGKILL cannot be caught:
inspect the current symlink, saved PM2 state and migrations before restarting.

The checks cover the app's local listener and database-backed API; they do not
verify public DNS, TLS or Nginx. Verify the public site after the host deployment.
