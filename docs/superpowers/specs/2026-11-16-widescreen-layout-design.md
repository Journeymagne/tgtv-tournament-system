# Widescreen tournament layout

The user requests an interface that uses widescreen monitors, with the faction statistics page as the reference. The current tournament shell caps the sidebar and content together at 1280px. The faction detail splits its remaining width equally, even when the players table needs at least 536px.

## Approach

Use a fluid tournament shell with modest responsive gutters and the existing 220px navigation. The user selected the combined general workspace and statistics scope on 2026-11-16. Expanding only statistics would leave the same problem on standings and tournament pages. Increasing the fixed cap would recreate the problem at larger resolutions.

Keep the existing theme, typography, controls, data and mobile navigation. Bound feedback forms and documentation prose independently so reading and typing remain comfortable.

Faction statistics adapt to their actual available width: stacked below 920px; recent games alongside a larger players table above 920px; all three sections (games, players, matchups) alongside one another above 2000px. Keep the DOM reading order games, players, matchups. Put statistics tabs and season selection in one wrapping toolbar to save vertical space on desktop.

The user's follow-up clarifies that every faction metric must be visible without horizontal scrolling. Below 792px of detail width, present players and matchup rows as cards with translated labels for each metric. Keep the same table DOM, visible wrapping sort buttons, search controls and empty-result handling. Desktop tables retain their current minimum widths. Do not hide or clip data to remove a scrollbar.

## Verification

Inspect actual rendered pages at 320–3440px, including long player names, empty statistics and both palettes. Verify that neither the page nor either faction-detail table overflows horizontally. Inspect both languages, sorting, searching, empty results and the browser accessibility tree. Any handed-over local preview must use a loopback application and database, a reusable LocalPreviewAdmin account and a normal session injected by an ignored local launcher under work/. Automated tests must not run locally, per AGENTS.md. No production deployment is requested.
