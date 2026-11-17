# Fight effect frequency

Goal: let each fighter apply each Scratch variant, PreParry, and Purity Seal either once per fight (the existing default) or once across all selected fights.

An effect is spent only when it actually triggers, at its first eligible opportunity. This does not optimize saving effects for a later fight. Each fighter and effect has an independent limit. Old links and saved weapon profiles retain the existing default.

- [x] Add regression cases for two/three fights, unused effects, independent fighters, both fight resolvers, and URL/worker/profile persistence. Do not run automated tests locally: AGENTS.md reserves execution for CI.
- [x] Add a per-model list of effects limited across fights, show a frequency selector for each enabled effect, and append it to fight share URLs.
- [x] Record actual use in dice conversion and fight resolution; remove spent limited abilities from private simulation profiles until the next simulation. Preserve the selected dice branch's usage metadata.
- [x] Check TypeScript and the diff; visually inspect the controls using the existing local application preview. No production deployment or merge is requested.

Verification: TypeScript (`tsc --noEmit`) and the integrated production build passed. A read-only reviewer found no concrete issues. Browser inspection used the existing administrator-autologin preview at `http://127.0.0.1:3016`, backed by `kt_widescreen_preview` on `127.0.0.1:55436`; `/api/me` reported `isAdmin: true` and administrator navigation was visible. Frequency settings survived sharing/reloading, rendered in RU/EN, and fit a 390px viewport. Three-fight browser examples showed different outcomes for both Purity Seal and PreParry; the two-fight Scratch example changed defender mean remaining wounds from 20.00 to 17.91. Screenshots and result transcripts are in ignored `work/fight-effect-frequency/`. Automated tests were authored for CI and were not run locally.

## Extension requested from the checkbox screenshot

Extend the same independent frequency choice to every fight checkbox and the three NicheAbility choices. The existing default stays unchanged. Triggered effects spend their use only on the selected dice conversion or actual combat resolution. Passive rules (Brutal, Dueller, Tilting Shields, Curse of Rot) apply throughout the first fight when limited, then expire. A failed condition preserves a triggered effect; there is no optimization over which fight to spend it in.

- [x] Add regression cases for every control, general roll-conversion usage, combat trigger usage, niche follow-ups, passive expiry, and expanded URL persistence; reserve execution for CI.
- [x] Generalize selected dice-outcome usage metadata beyond Purity Seal and track resolved combat effects without leaking lookahead uses.
- [x] Extend the frequency catalog, checkbox/niche controls, and RU/EN explanatory copy.
- [x] Run TypeScript/build and visually inspect the integrated authenticated local preview; request a read-only review.

Extension verification: TypeScript and the integrated build passed. Read-only review found no concrete correctness issues. Real browser controls exercised all 20 checkboxes and the three niche choices; a shared URL restored all enabled frequency settings. RU/EN labels and tooltips rendered correctly, with no document overflow at 390px and no page errors. Three-fight browser readouts changed as expected for FirstStrikeBonus, Severe, MysticScryBuff, and CurseOfRot. Dedicated local database and administrator session/navigation were rechecked. Evidence is in ignored `work/fight-effect-frequency-all/`. Automated tests were not run locally.

## Shooting and production release

The user requested PR/production deployment, then explicitly chose to add equivalent Shoot frequency settings before release. Scope: attacker Rending, Severe, Punishing, PuritySeal, MysticScryBuff, CurseOfRot; defender Punishing, Indomitus, TranshumanPhysiology, both Scratch variants, CurseOfRot, ObscuredTarget. Triggered rules spend their selected actual use; passive Curse/Obscured expire after the entire first Shoot. Repeated actions use an exact probability-state calculation, tracking side-specific uses and the existing two-success Saintly Relics cap with FNP. No new timing optimization is introduced.

- [x] Add exact multi-action probability regression cases and UI/link/legacy-profile tests; reserve automated execution for CI.
- [x] Add independent shooting controls, URL/profile persistence and RU/EN explanations.
- [x] Preserve selected attack/save conversion metadata and Scratch usage, and implement the exact sequence distribution.
- [x] Verify TypeScript, integrated build, syntax/shared assets and browser UI; obtain read-only review.
- [x] Prepare 1.5.38 release notes in both languages and an idempotent scoped migration preserving earlier database documentation.
- [ ] Open the release PR, inspect CI for its exact commit, fix failures, merge and wait for merge-commit CI.
- [ ] Publish the release tag, follow deployment, and verify production build plus both public changelog API entries.

Shooting browser evidence: 26 enabled frequency selectors across two situations survived sharing/reloading, with RU/EN rendering and no page errors or document overflow at 390px. Switching Situation A's Scratch to once changed its average damage from 0.00 to 0.10 while Situation B stayed 3.29. Read-only engine review found no concrete introduced issues. Evidence is in ignored `work/shoot-effect-frequency/`. Automated tests were not run locally.
