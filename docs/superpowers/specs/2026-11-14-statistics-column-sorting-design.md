# Statistics correctness and column sorting

The user approved implementing the statistics review on 2026-11-14: fix the identified aggregation/sorting defects and support every column in all listed statistics surfaces. Preserve official places; sort before pagination and top-N; run automated tests only in GitHub Actions.

## Design

Extend the existing table controls rather than introduce a UI framework. Each table/list owns its sort state, numeric/text/date/record columns and stable tie ordering. Missing values stay last in either direction. Use raw values where rendered cells contain decoration. Buttons expose direction and aria-sort; lists have equivalent labeled order controls. A reset restores the original order.

Official rank is immutable presentation data. Sorting never changes published results, tournament placement, pairing order or rating calculations. Server-paginated leaderboards and game history accept allowlisted sort/direction parameters and order the complete filtered dataset before LIMIT/OFFSET. Top-N views sort all eligible candidates before slicing. Scalar profile metrics remain a summary; every repeated history/card surface gains order controls.

Fix played faction attribution using result scores with legacy registration fallback. Registered players aggregate by account; guests/proxies by source, tournament, result key and recorded name. Fix per-table sort state and missing-value handling. Preserve the general statistics policy excluding mirror matches from faction performance; expose mirror counts separately and apply that policy consistently to detail, global Tac Op balance and tierlist summaries. Event-specific raw tournament totals continue to include all completed games, including mirrors; they describe the event rather than cross-event faction balance. Use the same published-tournament eligibility for global game statistics and the tierlist widget.

## Surfaces

- Desktop: global Kill Team/Tac Ops tables; faction cards; faction detail players, matchups and games; player/team/admin leaderboards; global game history; own/player/team/roster histories; tournament rounds/match lists; existing solo/team standings and tournament statistics.
- Mini App: tournament standings and game operation scores, plus repeated match/history lists.
- Tierlist: player/Tac Op rankings with sorting over all candidates before the three-row limit.
- Existing Excel export already has an autoFilter and retains official places.

## Alternatives

Chosen: extend current table controls, add server order contracts where data is paginated, and use order controls for card lists. A new table framework adds dependencies and migration risk; client sorting of a fetched page or an already truncated top-N does not meet the requirement.

## Validation

Write behavioral regression tests for wrong played faction, distinct proxy identities, mirrors, missing values, independent states, every sortable column, immutable rank and ordering across page/top-N boundaries. Do not execute automated tests locally. Push an isolated feature branch and use a PR or workflow dispatch to run CI for its exact SHA; diagnose failed job logs and repeat as needed. No production deployment is part of this request.
