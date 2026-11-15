# Share link

Observable end state: on the shooting calculator, clicking `Add Share Params` rewrites the address to a `?view=shoot&a1=...&d1=...&so1=...&a2=...&d2=...&so2=...` URL. The first colon-separated field of `a1` is Situation 1's Attacks value. Reloading that URL restores the Attacks select.

## Sub-features

- `Add Share Params` writes the current calculator into the query string (shoot or fight, depending on the active view).
- `📋 Copy Share Link` writes the absolute share URL to the clipboard. If clipboard permission is denied, the page shows `Copy failed — copy the URL manually`. Treat that message as the copy failing, and use the address bar as the source of truth.
- Fight uses its own query keys when that view is active (`/fight/` plus the fight encoders). Do not expect `a1=` on the fight view.

## How to get to it (user POV)

On `/` or `/fight/`, the two buttons are in the header, to the right of "How it works". They are absent on `/help`, `/notes/*`, and `/rules/*`.

## Driving it with the browser helper

1. On `/`, set Situation 1 Attacks to a non-default value with the `+` button (default is 4, so one press yields 5).
2. Click the button named `Add Share Params`.
3. `location.search` contains `view=shoot` and `a1=`. Decode `a1` (it is URI-encoded). Its first field, before the first `:`, equals the Attacks select value (`5` after one press).
4. Reload the page. The Situation 1 Attacks select is still that value, and `Average Damage` matches the value recorded before the reload.
5. Open `/help`. The share buttons are not in the header. Come back with the "Back to calculator" link (`/`).

Screenshot the address bar (or record `location.search` in the transcript) after the click, and screenshot the Attacks select after reload.

## Gotchas

- `Copy Share Link` needs clipboard access. Headless Chrome often denies it. A denied clipboard is not a failed calculator. The assertion is the URL `Add Share Params` writes.
- Share buttons call the functions registered by the active section. On first paint of Fight they exist, but they encode fight state only after Fight's effect runs. Wait until the Fight `h1` is showing before clicking them there.
- `a1` is not a single number. Only the first field is Attacks. The rest is BS, damage, and abilities.
