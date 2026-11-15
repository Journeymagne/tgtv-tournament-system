---
name: verify-ktcalc
description: Drive the ktcalc Kill Team calculator web UI locally (shooting, fighting, comparison matrix, share link, help and rules pages), capture screenshots and result text, and clean up only the processes the run started. Use when changing or fixing ktcalc, before opening a PR, or when asked to verify the app the way a user would.
---

# Verify ktcalc

ktcalc is a client-side React SPA. A user opens it in a browser, edits shooting or fighting inputs, and reads the probability readouts. There is no login, no database, and no required API key. This skill starts the documented dev server, checks that the process is the one just launched, drives the real UI, and writes evidence under `verify-artifacts/` (gitignored).

`VERIFICATION.md` is a separate engine differential sweep. It does not replace this skill. `npm run testq` is the unit suite; it also does not replace driving the UI.

## Prerequisites

- Node.js and npm, then `npm ci` from the repo root (same setup as the README).
- Google Chrome or Chromium on `PATH`, or `CHROME_PATH` set to the browser binary. macOS usually has `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. The drive script uses the system browser through the DevTools protocol. It does not add an npm dependency.
- `curl` and `lsof` (both ship with macOS; install `lsof` on Linux if doctor warns that it skipped the port-ownership check).
- No environment variables are required to boot the app. Do not put tokens or `.env` values in evidence. The dev server log may mention a Create React App babel-preset warning; that warning is expected and is not a failed compile.

Optional isolation variables (names only):

| Variable | Default | Role |
| --- | --- | --- |
| `VERIFY_PORT` | `4173` | Dev-server port. Deliberately not 3000, so a normal `npm start` can keep running. |
| `VERIFY_ARTIFACTS` | `verify-artifacts` | Where pid files, the log, screenshots, and `shoot-result.json` go. Relative paths are inside the repo. |
| `CHROME_PATH` | discovered | Browser binary for the drive script. |
| `CHROME_NO_SANDBOX` | unset | Set to `1` to pass `--no-sandbox`. Linux already does this. |

Two instances can run side by side only with different `VERIFY_PORT` and `VERIFY_ARTIFACTS`. The app keeps all state in the page and the URL, so there is no shared data directory. If the chosen port is already taken, or this artifacts directory already has a live pid, launch refuses. Do not drive a server you did not start.

## Launch

From the repo root:

```sh
.cursor/skills/verify-ktcalc/scripts/launch.sh
```

That runs `BROWSER=none PORT=$VERIFY_PORT npm start`. `prestart` runs `npm run copy-rules`, which copies `rules/*.md` into gitignored `public/rules/` so `/rules/*` can fetch them.

Ready means both of these are true:

- The log contains `Compiled successfully!` or `Compiled with warnings.`
- `http://127.0.0.1:$VERIFY_PORT/` returns the HTML shell (`id="root"` and the title `Kill Team 2024 Calculator`).

The script prints `verify-ktcalc: ready at http://127.0.0.1:4173/` (or whatever port you set). The dev-server pid is `verify-artifacts/dev-server.pid`. The log is `verify-artifacts/dev-server.log`.

## Doctor

Run this first whenever the page looks wrong, the port might be someone else's, or a previous run was interrupted:

```sh
.cursor/skills/verify-ktcalc/scripts/doctor.sh
```

It checks, without changing the app:

1. The recorded pid is alive.
2. `VERIFY_PORT` matches the port file for this artifacts directory.
3. `GET /` is the ktcalc shell.
4. The listener on that port is the recorded pid or a child of it (`lsof`). A foreign listener is a failure. Do not keep driving.
5. The log shows a completed compile.

Doctor prints `instance is worth driving` on success.

## Drive

Primary surface is the web UI. Header controls:

- `a[aria-label="Kill Team Shoot Calculator"]` — Shoot link, route `/` or `/?view=shoot`. Has `aria-current="page"` while that view is active.
- `a[aria-label="Kill Team Fight Calculator"]` — Fight link, route `/fight/` (`/?view=fight` is a legacy alias that redirects there).
- `a.AppHeader-help` — "How it works", route `/help`, `target="_blank"`.
- `button` "Add Share Params" and `button` "📋 Copy Share Link" — only on calculator routes.

The page heading (`h1`) is the view name: `Kill Team 2024 Shooting Calculator` or `Kill Team 2024 Fight Calculator`.

There is no Playwright or Cypress suite. The shipped drive opens Chrome, clicks the real controls, and reads the readouts. The proven path is Situation 1 shooting:

```sh
.cursor/skills/verify-ktcalc/scripts/drive-shoot.mjs
```

What that script does:

1. Runs doctor. If doctor fails, it does not drive.
2. Opens `http://127.0.0.1:$VERIFY_PORT/` in a fresh Chrome profile under the artifacts directory.
3. Waits until the `h1` contains `Shooting Calculator`.
4. Scopes to the visible panel titled `Situation 1`. That title is a text node in the title bar (Situation 2's title is a span, because that bar has a button). Ids are prefixed per panel (`s1-atk-Attacks`, `s2-atk-Attacks`, `fa-Attacks`, …), but still start from the panel title.
5. Reads the Attacks select (`select[id$="-Attacks"]`, i.e. `s1-atk-Attacks`) and the `Average Damage: N.NN` accordion header. Also reads Situation 2's average.
6. Clicks the `+` button that is the next sibling of that Attacks select (the same control a user presses).
7. Waits until Situation 1's Attacks value and Average Damage both change. Situation 2's Average Damage must stay the same.
8. Writes `verify-artifacts/shoot-before.png`, `verify-artifacts/shoot-after.png`, and `verify-artifacts/shoot-result.json`.

A passing run prints `verify-ktcalc drive-shoot: PASS` and exits 0. The screenshots are a clip of Situation 1 covering the Attacks control and the Average Damage header, before and after the click.

Recipes for the other mapped features are in `features/`. Follow those steps in the same browser; do not call engine functions or set React state from the console. Changing a `<select>` by assigning `.value` from a script skips the `+` / `-` buttons, but it is still the control the user changes; prefer the `+` button when the step is "one more attack".

`?view=mass` still mounts the mass-analysis section, but the header button for it is commented out, so it is not a primary user path. Do not treat it as the thing to prove.

## Evidence

Directory: `verify-artifacts/` at the repo root (override with `VERIFY_ARTIFACTS`). It is gitignored. Put screenshots, `shoot-result.json`, and the dev-server log there, and attach them to the PR. Do not commit them.

Proof standard for a UI change:

- Exercise the route and control a user would touch.
- Capture the control before the action and the readout after it. A single final screenshot is not enough.
- Check a side effect. For shooting, Situation 2's Average Damage stays put when only Situation 1 changes. For the share link, the address bar gains `a1=` (and the rest of the shoot query). For rules pages, the markdown heading is visible and the page is not showing `Could not load this document`.
- Do not mock the calculator. Nothing in the user path calls an external game service. The only network the app needs is its own dev server (the Google tag in `public/index.html` may fail offline; that must not be treated as the feature working or failing).

## Cleanup

```sh
.cursor/skills/verify-ktcalc/scripts/cleanup.sh
```

This stops the recorded dev-server pid and, if a drive was interrupted, the recorded Chrome pid, including their child processes. It does not kill by process name, so a user's other `npm start` or Chrome stays up. On Windows (Git Bash), `npm start` runs as a native process tree that POSIX `kill` can't follow, so cleanup first stops the recorded pid's whole tree with `taskkill /T`; otherwise the dev server would outlive cleanup and keep the port. It does not delete `verify-artifacts/` contents other than the pid and port files. Screenshots, `shoot-result.json`, and `dev-server.log` remain.

Run cleanup after a failed attempt before launching again on the same port and artifacts directory.

## Helpers

All of these are repo-relative and executable:

```sh
.cursor/skills/verify-ktcalc/scripts/launch.sh
.cursor/skills/verify-ktcalc/scripts/doctor.sh
.cursor/skills/verify-ktcalc/scripts/drive-shoot.mjs
.cursor/skills/verify-ktcalc/scripts/cleanup.sh
```

`scripts/common.sh` is sourced by the shell helpers. `scripts/lib/browser.mjs` is imported by `drive-shoot.mjs`.
