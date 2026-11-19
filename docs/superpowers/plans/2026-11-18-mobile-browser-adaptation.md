# Mobile browser adaptation

**Goal:** Preserve the site's visual identity, content and desktop behavior while making the existing web UI usable from 320 CSS px, including touch and short landscape screens.

**Stack:** Node.js monolith, PostgreSQL, plain JavaScript/CSS, embedded React Combat Lab. Work on `codex/mobile-browser-adaptation`; no publishing or deployment. Preserve unrelated tournament-provider documents.

## Plan

- [x] Read project instructions and responsive-design, impeccable adapt, web-design-guidelines and webapp-testing.
- [x] Start the existing loopback PostgreSQL preview and verify normal LocalPreviewAdmin session through the user-facing proxy.
- [x] Capture 21 initial routes at 390 px, representative desktop screenshots at 1440 px, and survey all eight requested widths.
- [ ] Correct content sizing, mobile input/touch sizing, safe areas, short-screen overlays and keyboard navigation in existing shared components. Keep table scrolling local and keyboard accessible.
- [ ] Exercise deeper tournament, Studio, FAQ, training and tierlist states; fix reproduced issues without redesigning surfaces or changing product copy.
- [ ] Run saved Playwright checks at 320, 360, 375, 390, 430, 768, 1024, 1440 and phone landscape. Cover Chromium, Firefox and WebKit; visually inspect representative screenshots.
- [ ] Audit changed files with current Web Interface Guidelines, synchronize shared asset versions, run relevant authorized project checks and report exact results and hardware gaps.

## Evidence and decisions

Initial captures and runtime helpers live in ignored `work/mobile-runtime/`. Reusable browser checks and final report live in `review/mobile-browser-adaptation/`. The standing instruction allows local automated runs when explicitly requested; the user's original request explicitly requests Playwright and relevant project checks. No production database or production authentication changes are permitted.

Initial reproduced issue: Administration heading creates document widths of 371 px at 320 and 360 px. Closed tournament navigation remains in the keyboard order; opening it does not move focus. FAQ card actions measure 18–24 px. Existing form text in several services is 14 px, which can trigger iOS focus zoom. Short-screen notification panels depend on a full header offset and need direct interaction checks.
