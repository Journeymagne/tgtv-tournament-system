# Local backups after successful releases

**Goal:** Keep two verified tournament-system database backups on the user's C
drive, replacing older copies after successful releases without depending on the
PC being online during deployment.

**Design:** After the existing production smoke job passes, an SSH job creates a
consistent PostgreSQL custom-format dump on the server. Verify the archive catalog
and full extraction, compute SHA-256, then publish an atomic index retaining two
complete snapshots. Never transfer database contents through GitHub Actions.

A current-user Windows scheduled task polls the private index over existing SSH
every five minutes and at logon. It downloads to staging, verifies size/hash, then
publishes each backup and prunes only managed older snapshots. The installation is
self-contained in `C:\Backups\KTCompanion`, restricted to the user, administrators
and SYSTEM. No passwords, new production accounts or new SSH keys are needed.
Missed releases are collected from the server's two latest snapshots when the PC
is available again. Network failures preserve existing verified local backups.

**Steps:**

1. Implement/test server-side manifest/retention and backup production with path
   boundaries, healthy-release/SHA checks, atomic publication and idempotency.
2. Add the required SSH backup job after successful post-deploy checks, using the
   tagged release's committed script under the application deployment lock.
3. Implement the PowerShell downloader/installer with two-copy retention, safe
   staging, SHA-256 checks, exclusive lock, bounded log and hidden scheduled task.
4. Review and validate through exact-commit GitHub CI (no local automated tests).
5. Install the checked server utility and local task, seed a verified existing
   snapshot plus a fresh current-release snapshot, run the scheduled sync, verify
   both local files, task configuration, server retention and application health.

This is operational tooling; it does not require a new application release or
database migration. Preserve existing release, daily/FTP backups and cache policy.
