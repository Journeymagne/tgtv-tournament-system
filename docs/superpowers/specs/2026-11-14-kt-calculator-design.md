# KT Calculator fixes

The user approved fixing all four findings from the code and browser review.

## Behavior

- Shooting and fighting calculate on first opening and 250 ms after the last input change, using the existing worker. Changing inputs cancels obsolete work. Hidden calculator views do not run. Manual retry and cancellation remain available; cancellation does not immediately restart the same inputs.
- Situation 2 can collapse on desktop and mobile. Its inputs stay mounted and retain their values; it still participates in calculations. The toggle is keyboard accessible and exposes its expanded state.
- A separate Situation 1 + 2 result uses each situation's selected defender save and its other settings. It shows average damage, kill chance and injured-but-alive chance, using wounds from Situation 1 as the target threshold. The existing comparison matrix stays available.
- Weapon-profile controls, placeholders, accessible labels, success/error messages and dynamic counts translate between RU and EN. User-authored profile names remain unchanged.

## Approach

Extend the existing React components, worker lifecycle and Companion dictionary. Retain asynchronous calculation rather than move expensive work into rendering. Use the existing damage convolution and injury/kill utilities for the exact combination. Do not change the combat engine, persistence format or production authentication.

## Verification

Add focused regression tests before implementation. Repository AGENTS.md prohibits local automated test execution: run those tests in GitHub Actions. Build locally and drive real browser controls and workers following the local verify-ktcalc skill, adapted to the documented current server commands. Capture screenshots and a result transcript. Prepare a reviewable branch/patch; production deployment is outside this request.
