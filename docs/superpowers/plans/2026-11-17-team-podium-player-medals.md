# Team podium personal medals

**Goal:** Award personal podium titles to registered players in the top three team tournament rosters, including the completed `tgttfour` tournament.

**Design:** Keep existing team medals and create player medals alongside them, uniquely identified by tournament, place and recipient kind. Use the tournament roster at completion, rather than the organization's current membership. Guests and players replaced before completion receive no personal medal. Reconciliation removes outdated winners, is repeatable, and respects deleted medals and edited text.

**Constraints:** No local automated tests (AGENTS.md). Validate through GitHub CI for the exact change commit. Production releases require matching Russian and English public changelog entries verified through the deployed API. Keep production authentication unchanged.

## Implementation

- [ ] Add integration coverage for personal profiles, top-three recipients, roster replacements, guests, repeat publication, changed winners and deleted medals.
- [ ] Extend podium synchronization and migrate uniqueness to include kind. Backfill completed team tournaments under tournament locks without recalculating results or ratings.
- [ ] Prepare release 1.5.36 with bilingual notes and a documentation data migration preserving editorial changes.
- [ ] Review the diff, check syntax, and obtain green CI for the exact commit before release. No local test execution.
- [ ] Verify deployed personal awards for all nine final roster players of `tgttfour`, team medals, and both public changelog APIs.
