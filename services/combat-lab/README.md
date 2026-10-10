# Companion Combat Lab 1.1.0

Separate local demonstration service, based on jfreal/ktcalc commit 80760be900c72831dde9da53071510901af3ab95 (2026-10-06).
The original shooting/fight engines and calculator parameters are retained. Both screens now use the same Companion controls and an explicit Calculate action. The Companion shell uses the shared Companion design tokens and logos. /simulation adds official operative/weapon selection, optional rule-to-engine effects, cover, remaining wounds, worker calculations, share URLs and browser-local saved scenarios.

## Start

From `services/combat-lab`, copy `.env.example` to `.env`, choose a free port (for example 3007), and configure `REFERENCE_DIR` for your local PDF library. Node >=22.13. Run `npm ci --ignore-scripts`, then `npm run build:demo`, then `npm start`. Configuration is in `.env`; logs belong in `work/`. The demo has no database, accounts or remote writes. The prepared production build starts with Node built-ins and needs no node_modules at runtime. The prepared demo uses http://127.0.0.1:3007 (simulation: /simulation). Open the URL printed by the server.

`npm run dev` runs the CRA development server with the same local API. `GET /api/health` returns service and catalogue status; `GET /api/catalog` returns the catalogue. `/library/<team>.pdf` serves the matching local official reference.

## Official data

The source snapshot is 2026-09-25, from https://www.warhammer-community.com/en-gb/downloads/kill-team/. All 48 team PDFs are imported by `tools/import_catalog.py` using geometric card/table positions; historical update logs are excluded. Numeric profiles and weapon attack types come from the current cards and ranged/melee icons. Four noncombat devices without weapon profiles are intentionally excluded from duels. Full import evidence is in `work/import-report.json`.

`REFERENCE_DIR` points to the existing official library. The JSON catalogue is bundled locally; source PDF links require that library. Optional data regeneration needs PyMuPDF (`python -m pip install --target tools/vendor pymupdf`).

Weapon maths supported by the core is applied automatically. Positional/mission effects, secondary targets and Hot self-damage are outside a one-target duel. Additional operative/faction rules are enabled when added and remain editable: suggested keyword matches are starting points, not certified complete rule translations. Disable a rule if its conditions are not met. Rules without configured combat effects are labelled and do not change the calculation until effects are added. Engine approximations remain those of the pinned upstream revision.

## Shared interaction

Calculator and simulation use the same mode switch, Share / Save scenario actions, numeric steppers and Calculate / Cancel button. Results keep their completed input snapshot; editing parameters marks them as out of date until the next calculation. Work runs in a Worker in both tabs. Calculator scenarios store local share URLs; simulation scenarios store operative selections and bonuses. Existing simulation scenarios are preserved.

The visible UI intentionally differs from the upstream verification recipe: choose the mode using the shared buttons and click `Рассчитать` before reading a result. The shared `Поделиться` action writes parameters into the URL and copies it, with a manual-copy fallback. Browser evidence is saved as `verify-artifacts/unified-*`.

## Verification

`npx tsc --noEmit` and `npm run build:demo`; drive the actual UI following `.cursor/skills/verify-ktcalc/SKILL.md`. Evidence for both original calculator workflows and the duel is saved under `verify-artifacts/`. On Windows the project can be launched with PowerShell/.NET and verified with Playwright against the owned local service instead of the shell-specific launch/doctor wrappers.

## Attribution

Original calculator: https://github.com/jfreal/ktcalc — Unlicense, preserved in LICENSE. Official game references: Games Workshop / Warhammer Community. This is an unofficial local demonstration.
