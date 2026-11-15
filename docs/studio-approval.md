# Seal Of Approval

Superadmin grants or revokes approval from the published team's viewer. The
orange seal appears opposite the team logo in the library and at the top right
of each selection card's first side, including PDF and newly generated TTS packs.
The title reserves space for the seal. Ordinary administrators and authors
cannot grant approval.

Approval belongs to the team, **not a particular version**. Publishing changes
or renaming the team preserves it until a superadmin explicitly revokes it.
Copies, conflict-recovery copies and imported JSON cannot grant approval to a
new team. Existing downloaded PDFs and TTS snapshots retain their original image.

Migration `063_studio_approval` adds approval metadata to `studio.studio_projects`.
No new environment variables or dependencies are required. The normal deployment
migration must run before the updated Studio service starts.

`PATCH /api/studio/admin/library/:id/approval` requires the superadmin role,
the Studio account header, CSRF token, boolean `approved`, current approval
`revision`, and `publicationRevision`. Stale changes return 409. Approval has a
separate revision, so granting it does not conflict with an author's unsaved draft.
Grant/revoke events are written to the administrative audit log.

`approval` in library/draft responses is server-owned. `team.sealOfApproval` is
a rendering projection set by the server; incoming project JSON cannot persist
it. The browser refreshes it from cloud metadata. Offline JSON and screenshots
are not a verification mechanism; the public library is the source of truth.

## Asset

`public/studio/assets/seal-of-approval-cutout.png` is the user's orange seal
artwork with a transparent background and transparent eyes, nose, mouth and
whiskers. Prepared using the built-in imagegen tool. All white details are
transparent cutouts, so the underlying card background shows through them.
Final edit prompt: "Make every white part fully transparent. Preserve the orange
seal silhouette, fur contours, orange eye highlights and inverted orange triangle.
Only orange artwork and transparency should remain. No shadows or new elements."
