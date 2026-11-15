# KnowThyKT changelog release plan

**Goal:** Publish the user's pending question edits and add a public bilingual KnowThyKT update-history tab.

**Scope approved by the user:** Deploy the local changes and add a separate trainer changelog as a tab. Use the existing training navigation, `#changelog`, and the label «Что нового» / “What's new”. Release version: 1.5.19.

- [ ] Add a standalone localized training changelog renderer, public navigation and responsive token-based styles.
- [ ] Retain old English question snapshots alongside the current editorial entries. Include only the previously authorized source changes, not generated review artifacts.
- [ ] Add renderer coverage and a release-notes migration that preserves existing public editorial history. Do not run automated tests locally, as required by AGENTS.md; validate the exact pushed commit in GitHub Actions.
- [ ] Publish matching Russian and English release notes, merge the verified commit, tag v1.5.19 and follow the production deployment to completion.
- [ ] Inspect the public tab in both languages, both site origins and a narrow viewport. Verify both public Changelog APIs contain 1.5.19, the active bank has no Portable Barricade questions, and kt-134 / kt-287 remain under review.

No local application preview is needed. Production authentication remains unchanged. No new provider, dependency or database schema is required.
