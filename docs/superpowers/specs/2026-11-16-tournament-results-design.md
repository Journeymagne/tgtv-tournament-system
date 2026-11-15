# Organizer completion and tournament results

Approved in chat: the fourth concept, refined to the existing UI kit. Reference: the local `outputs/tournament-results-ui-kit-2026-11-16` mockup in the original checkout.

Completing matches closes their round, but never publishes or closes the tournament. Once every configured round and match is complete, the organizer (and platform administrators) can explicitly choose **Завершить турнир / Finish tournament**, confirm, and publish the existing official standings. Delegated judges cannot finish a tournament. The server must reject premature, unauthorized, cancelled, and repeated completion requests. Existing correction/republication flows for already completed team tournaments remain supported internally.

Completed tournaments show an **Итоги / Results** tab and the same results in their overview: a large champion card, second and third places, top ten official players or rosters, and rank-one personal players for team tournaments. Preserve shared first place in the personal ranking, show fewer rows for smaller events, and do not invent scores or identities. Render user-provided names as text. Standard pages retain full standings, matches and statistics.

Use the existing `--surface`, `--panel`, `--panel-2`, `--line`, `--accent`, `--ink`, and control tokens. Cards use neutral surfaces, 10px corners, and a thin orange champion border; controls use the existing primary/secondary classes and standard sizes. The page adapts to mobile. Both languages and themes work.

A public **Скачать PNG / Download PNG** action produces a shareable result image using the same canonical client model as the page. The browser canvas renderer avoids external rendering services, dependencies, network fonts and cross-origin assets; wrap long names and grow the image if needed. Download uses the tournament name and a PNG MIME type. Export errors are visible and retryable.

Approaches considered: a generated poster, a traditional table page, and a champion-led card composition. The user chose the card composition and its subsequent UI-kit revision. Canvas export is an implementation choice to keep hosting and deployment unchanged.

No production deployment requested. Automated tests run in CI only, per AGENTS.md. Visual/browser inspection is permitted. Any full local app preview must use only local databases and the standing local-admin autologin workflow.
