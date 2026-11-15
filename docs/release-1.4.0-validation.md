# KT Companion 1.4.0 validation

Release date: 20 October 2026. Base: main 8cbb720 (1.3.0).

## Included changes

- Telegram bot and Mini App; shared account pages and guest browsing.
- Studio D6 editor, shared dice renderer and combined TTS packs.
- FAQ card deletion with revision checks, preserved history and moderation rights.
- Shared notifications with durable outboxes; optional gateway plus six backend
  processes and separate PostgreSQL roles/schemas. Compatible monolith retained.
- Shared header, theme and layout updates. Existing 1.3.0 changes are preserved.

Know Thy Kill Team is excluded: no page, questions, API, achievement/progress
hooks, service, database schema, credentials or migration 056. Numbers 057–060
are retained; 056 remains reserved. The original working files, including the
excluded module, were checked against their pre-release SHA-256 manifest.

## Automated regression before merging into main

The complete serial unit and integration run passed **1074 tests**,
with zero failures, skipped tests or cancellations. It used PostgreSQL 16.14
at 127.0.0.1:55440, in the new release140_locale_test database with an ICU
Unicode locale. No production or user database was used.

Fixtures now reset all application schemas and use the application search path.
Notification checks run the real producer/delivery workers before reading the
inbox. Guest-read checks retain permission assertions for writes. Historical
migration replay is tested before the schema move; upgrades preserve existing
accounts, sessions, publications, results and snapshot identities.

The run caught and fixed the new account-deletion trigger deleting tournament
games: it now removes challenge games only, retaining tournament history and
score/result keys. Mini App session handling uses a transaction.

JavaScript syntax and Git whitespace checks passed. Both package/lockfile pairs
use 1.4.0, with unchanged dependencies. The existing Combat Lab bundle matched
the full source/output fingerprint; compilation was correctly skipped.

## Runtime and browser checks

An independent release140_smoke database exercised monolith startup and all
seven processes with dedicated database roles. Ten pages and seven APIs
returned 200, including Combat Lab build readiness. Five trainer page/API
paths returned 404; no trainer schema or migration journal entry was present.

A normal administrator session survived switching from monolith to services;
/api/session and /api/me confirmed identity and administrator status. Four
non-account roles were denied password hashes, session tokens and account
deletion. FAQ notifications reached the durable shared inbox. With tournaments
stopped, its requests returned 503 while account, FAQ and Studio remained usable.

Twelve real browser page/viewport combinations covered home, tournaments,
Studio, FAQ, account and Mini App at 1440px and 390px. No JavaScript errors or
horizontal overflow occurred. Home, Studio and FAQ screenshots were inspected.
Evidence is in ignored work/release-140-*.json, *.log and browser-*.png files.

## Limitations and deployment

Docker Desktop failed to start on the local machine, so the container image was
not rebuilt in this run. Service startup and role isolation were verified with
native Node/PostgreSQL processes. Real Telegram delivery was not exercised;
the bot remained disabled and no messages were sent.

Migration 058 moves existing tables into service schemas. Before deploying,
verify a database backup and stop old writers. Code from 1.3.0 cannot run against
the migrated schema; rolling back requires a compatible database recovery.
See deployment.md and service-separation.md for the cutover and role setup.

The GitHub source ZIP is generated from the tagged commit and checked for
excluded module files, runtime data and secrets. Publication updates main and
the v1.4.0 tag; it does not update the production server.
