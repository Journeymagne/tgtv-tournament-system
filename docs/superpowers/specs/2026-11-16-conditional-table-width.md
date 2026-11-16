# Conditional table width

The user revised the widescreen requirement after release 1.5.28: retain the usual site width and expand only when an opened table needs more horizontal room.

Restore the 1280px shell cap and 18px gutters. Measure visible native tables inside the tournament workspace at the ordinary width. If they overflow, find the smallest shell width that fits them, bounded by the viewport. Keep the existing narrow-screen statistics cards. When even the viewport is insufficient, use its available width and preserve access to all columns. Fixed-width widgets that cannot benefit from shell expansion should not expand the page.

Recalculate after navigation, asynchronous rendering, table changes, visibility changes, fonts and viewport resizing. Measure from the ordinary width each time within one animation frame to avoid collapse/expand oscillation. Ignore the controller's own style mutations. Keep other release 1.5.28 functionality.

Implementation: a small tournament-only controller shared by the static and server-rendered entrypoints, a CSS custom property for the conditional width, and generated cache versions. Verify real browser geometry, normal pages, wide tables, nested grids, navigation and mobile statistics. Automated regression checks run only in GitHub Actions, per AGENTS.md. Publish matching Russian and English public notes with the correction release.
