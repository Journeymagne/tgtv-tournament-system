# Local previews for user testing

Whenever deploying or starting this project locally for the user to test, complete
administrator autologin before handing over the preview. This is the user's standing
instruction; do not ask again whether to create a local test administrator or sign in.

- Verify that the app and database are local. Use a dedicated, reusable local test
  administrator, such as `LocalPreviewAdmin`, and a normal application session.
- Open the preview already authenticated, or configure the local preview launcher so
  opening or refreshing the supplied local URL automatically signs the user in.
  Signing in only inside the agent's separate browser does not satisfy this rule.
- Keep any autologin helper and session material in ignored local runtime files under
  `work/`. Keep production authentication unchanged and never enable autologin for a
  remotely hosted app or a remote/production database.
- Verify the static page and `/api/me`, including `user.isAdmin === true`, and check
  that administrator controls are available. Give the user the ready-to-use local URL
  instead of a list of accounts with unknown passwords or a manual login requirement.
- If the user explicitly requests anonymous access or testing another role, follow
  that request for the relevant preview.

# Automated tests

GitHub Actions CI (`.github/workflows/ci.yml`) selects affected service tests on
pushes and pull requests to `main`. Shared guards always accompany selected root
tests; shared backend changes select all root tests. Combat Lab runs separately
when its sources, build tooling, CI workflow or Node.js runtime requirements change.
The manual workflow dispatch runs the full suite. Integration checks use a dedicated
PostgreSQL test database, including real isolated service roles and processes.

Do not run automated tests locally, including before merging into `main`, unless
the user explicitly requests a local run. Check the CI result for the relevant
commit and diagnose failures from the failed job's logs. Do not treat an older
successful run as validation of newer changes.

Visual inspection and local page/API availability checks remain part of the
preview workflow.

# Public changelog after production deploys

- For each production release, write matching public release notes in
  `docs/documentation/ru/changelog.md` and `docs/documentation/en/changelog.md`.
  Record the version, release date and changes users can see.
- After each successful production deploy, check the public Changelog in both
  languages and publish any missing entry. The site serves these pages from
  the database, so updating `CHANGELOG.md` or the seed files alone is insufficient.
  Use the documentation editor or a scoped data migration, preserving earlier
  entries and editorial changes.
- Treat the release as complete only after the deployed version is visible in
  both `/api/documentation/ru/changelog` and `/api/documentation/en/changelog`.

# Local backups only at release completion

- Standing user instruction (2026-11-18): do not create periodic Windows tasks,
  polling loops or logon triggers for backups. The old KTCompanion-BackupSync task
  was removed because its recurring console window interrupted the user.
- After a production release and its CI smoke checks/server backup job succeed,
  run C:\Backups\KTCompanion\Sync-Backups.ps1 once on this Windows PC, with
  -BackupRoot C:\Backups\KTCompanion. This is the local-copy step of the release.
- Verify successful exit, at most two complete local snapshots, and the deployed
  full commit SHA in C:\Backups\KTCompanion\last-sync.json before claiming that
  release backups are copied. Preserve current backups on errors.
- If this PC is unavailable, report the local copy as pending and perform it
  explicitly when available; do not restore automatic polling as a workaround.

# Shared services and clients

- For mobile work, identify the affected client. This repository owns the mobile
  website, Telegram Mini App (`/miniapp`), bot and shared backend API. Native
  Android/iOS screens live in the `kt-companion-mobile` repository linked in
  [README.md](README.md). For a shared API change, check the contract used by
  the affected clients.
- For changes to match results or permissions, follow the affected player's or
  organizer's action through the client to the tournament backend. Reuse the
  existing scoring and authorization logic. For a preview, check the affected
  role and entry point; an admin session alone cannot verify a player's access.
  See [Telegram Mini App](docs/telegram-miniapp.md).
- For changes that cross service boundaries, consult the ownership table and
  database contracts in [service separation](docs/service-separation.md).
  Check that each affected service can perform the operation with its own
  database role in the split deployment.
- When changing shared UI assets or generated sign-in fields, edit their source
  and run `npm run assets:sync` to refresh the generated files and cache keys.
  [The sync script](scripts/sync-shared-assets.js) lists its inputs.

# Kill Team rules in training content

- For a Know Thy Kill Team question or answer correction, check the course
  scope and source records in the [question bank guide](src/training-data/README.md).
  Record the rules publication and section supporting the answer. Follow the
  guide's versioning process so past answers retain the wording the player saw.
