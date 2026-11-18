# Calendar creation for tournament organizers

Reuse existing tournament-creation permission for POST calendar events and the Add event button. Keep edit/delete, admin detail, tournament creation from an announcement and draft visibility unchanged. Check real DB actor attribution, public visibility, permission revocation and renderer controls through GitHub CI; no local automated tests.

Release 1.6.1 updates both public changelogs through an additive, idempotent data migration preserving editorial history, and refreshes client asset URLs. After exact-commit CI and review, deploy using the existing tag workflow, verify all post-deploy application checks/public notes, then copy local backups once at release completion as required by AGENTS.md.
