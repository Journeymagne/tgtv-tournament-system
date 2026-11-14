# KT Calculator Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix automatic calculation, Situation 2 collapse, exact combined results and weapon-profile English translation.

**Architecture:** Add a small automatic worker scheduling hook, use it in the existing shooting/fighting sections, and reuse existing damage probability helpers for a dedicated combined summary. Keep the current manual worker API for simulations.

**Tech Stack:** React 17, TypeScript, existing web workers, Jest/Testing Library, Companion DOM translation.

**Spec:** docs/superpowers/specs/2026-11-14-kt-calculator-design.md

## Global Constraints

- No local automated test execution; use GitHub Actions as required by AGENTS.md.
- Preserve engine mathematics, saved profiles and production authentication.
- Build and verify actual browser controls and workers; save screenshots and result text.

## Review Focus

- Rapid edits must replace obsolete calculations, without an effect/render restart loop.
- Cancellation, errors and inactive tabs must not silently restart unchanged inputs.
- Different S1/S2 saves must select different distributions; injury excludes kills.
- Collapsed S2 retains inputs and contributes to the result.
- EN/RU switching translates dynamic profile messages and preserves user-entered names.

## Tasks

### 1. Regression coverage and CI baseline

- [ ] Add worker-scheduling lifecycle tests, exact-combo fixture tests, section collapse tests and dictionary runtime tests.
- [ ] Commit the regression tests and design/plan; run CI and inspect expected failures before implementation when remote credentials are available.

### 2. Automatic worker scheduling

- [ ] Create `src/lab/useAutomaticCalculation.ts` wrapping the existing worker hook: `(makeWorker, job, stamp, active)` with a 250 ms effect keyed by stamp/active; cancel obsolete work on cleanup, retain manual retry and cancel.
- [ ] Stabilize worker `run` with `useCallback`; wire shooting/fighting sections and automatic status copy without changing simulation behavior.

### 3. Collapse and exact combination

- [ ] Add an accessible S2 toggle and a hidden, mounted S2 body; style the compact header for 390 px.
- [ ] Add `components/CombinedShootResults.tsx` using each result snapshot's selected save and S1 wounds; show average, injury and kill probabilities with two decimals.

### 4. Translation and final verification

- [ ] Add static pairs and dynamic patterns to the Combat Lab dictionary; skip user-authored profile option names.
- [ ] Build, drive real browser flows for all four fixes plus routing/cancellation, and record evidence.
- [ ] Inspect CI for the final commit, obtain a fresh independent code review, resolve important findings, and package the patch and evidence for the user.
