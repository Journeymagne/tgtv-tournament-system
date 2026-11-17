# Release retention

Keep the active release and the two most recent older releases whose manifests
record `healthy`. Remove other recognized release directories, including abandoned
preparations, only while holding the deployment lock. Protect PM2 process paths,
unrecognized entries, symlinks and physical runtime storage. Never follow release
symlinks into shared data. Record the plan before deleting and revalidate targets.

Implementation and verification:

1. Add isolated filesystem tests for retention, failed preparations, rollback order,
   process protection, malformed manifests, physical work storage and path changes.
2. Implement a standalone dry-run/apply utility and invoke it after both successful
   deployment paths. Cleanup errors warn without rolling back a healthy release.
3. Add a daily systemd timer using the same deployment lock and a stable installed
   copy of the utility. Document installation and recovery boundaries.
4. Review the change and run the relevant CI on its exact commit; do not run local
   automated tests, per AGENTS.md.
5. Install the checked utility and timer on production, inspect its dry-run plan,
   apply cleanup, and verify retained releases, free disk, site and analytics.

This is deployment maintenance; application version and public content stay at
1.6.0. No new application release or database migration is required.
