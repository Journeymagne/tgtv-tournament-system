# Widescreen Layout Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this small presentation change inline. Steps use checkbox syntax for tracking.

**Goal:** Use widescreen space while keeping tables, navigation and prose usable.

**Architecture:** Adjust the existing CSS grid shell and use container queries for faction detail sections. Move the existing matchups section into the detail grid without changing data or event handlers. Keep CSS asset versions synchronized through the existing generator.

**Tech Stack:** Vanilla JavaScript, CSS grid, container queries, existing Node.js application.

**Spec:** docs/superpowers/specs/2026-11-16-widescreen-layout-design.md

## Global Constraints

- Do not run automated tests locally; use visual inspection and page/API availability checks.
- Preserve mobile navigation, colors, typography, statistics calculations and authentication.
- Keep preview helpers and session material in ignored work/ files, using a local database only.
- Leave unrelated Umami changes and output/ untouched.

## Review Focus

- Narrow content areas must stack detail sections even on desktop viewports.
- At 2560/3440px the matchups table must fit beside games and players.
- Faction detail tables must display all metrics without horizontal scrolling, including mobile layouts.
- Long names and empty sections must not force grid tracks wider.
- Prose and input forms must remain readable after the shell expands.

## Task 1: Responsive shell and statistics

- [x] Update public/styles.css: fluid shell gutters, minimum content width, independently bounded forms, and faction detail container queries at 920/2000px.
- [x] Update public/app.js: place matchups inside the detail grid and group tabs/season in a wrapping toolbar; retain existing controls and selectors.
- [x] Update public/documentation.css: bound prose while allowing tables to use the article width.
- [x] Add translated cell labels and narrow card layout for faction tables below 792px of detail width, preserving sort controls and filtering.
- [x] Run npm run assets:sync to regenerate shared cache versions.

## Task 2: Visual verification and handover

- [x] Prepare a local-only application/database and ignored administrator autologin launcher, reusing existing resources where available.
- [x] Inspect statistics, leaderboard, profile, forms, games and documentation across mobile and widescreen sizes; record screenshots and geometry under work/.
- [x] Verify the supplied URL, administrator session through /api/me and administrator navigation.
- [x] Review git diff and whitespace; report verification limits accurately. Do not claim a CI pass for unpushed changes.

## Verification record — 2026-11-16

- Edge screenshots and geometry: 320, 390, 768, 900, 901, 1100, 1120, 1280, 1920, 2560 and 3440px. No document overflow in inspected pages. Neither faction table has horizontal overflow at any inspected width: narrow layouts show labeled cards; the full players table fits at 1280px and both tables fit at 2560/3440px.
- Inspected dark/light statistics, venue without games, long unbroken player names, documentation article, profile, feedback, leaderboard, games and tournament listing. No browser page errors. Feedback form stays at 760px; documentation paragraphs at 850px in the inspected font.
- Caught and fixed implicit list-track overflow from long names. Updated app.js cache key as well as generated shared CSS versions. Independent review reported no remaining findings.
- Follow-up: checked actual Russian/English locale switching, sorting, long-name search, reset and empty results in the narrow card layout. Edge's accessibility tree retains both tables, 10 column headers and all data cells. No browser errors.
- Local application: 127.0.0.1:3017 behind administrator autologin proxy 127.0.0.1:3016. Database: 127.0.0.1:55436/kt_widescreen_preview, with generated demonstration games and reusable LocalPreviewAdmin. Launcher, sessions, database, logs and screenshots are ignored under work/widescreen-runtime/.
- JavaScript syntax and git diff whitespace checks completed. Automated tests were not run locally. No CI validation or production deployment is claimed for these uncommitted changes.
