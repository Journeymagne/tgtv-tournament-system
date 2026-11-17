# All-application post-deployment checks

**Goal:** Make the production workflow fail if a deployed application, its API,
required static assets or analytics is unavailable or serving an older release.

**Architecture:** A reusable GitHub Actions workflow runs a dependency-free Node.js
HTTP smoke checker after the SSH deployment job. It also supports manual checks
of the current production release without redeploying. All requests are anonymous
GETs; no test data, sessions, email or analytics events are created.

**Scope:** Home, tournaments/calendar, Combat Lab, initiative, activation tracker,
Studio, Dice Generator, FAQ, Know Thy Kill Team, tierlists, account and map pages.
Check all eight backend services via representative JSON endpoints, including
expected authentication errors for private notifications and personal lists.
Validate page identity and referenced same-origin JavaScript/CSS, response MIME
types, service ownership and the expected deployment SHA in release headers.
Check Umami heartbeat/dashboard/tracker separately, without application headers.

**Implementation:**

1. Add focused fixture-server tests for wrong release, masked HTML errors, API
   shape/status/service errors, broken assets, redirects, retries and diagnostics.
2. Implement `scripts/post-deploy-smoke.js` with bounded requests, retries and a
   complete report. Fail after collecting all failures; never print API contents.
   Enforce a global six-minute budget so stalled requests cannot consume the
   ten-minute Actions deadline before reports are written.
3. Add a reusable/manual workflow, call it from `deploy.yml`, preserve the existing
   exact-commit CI gate and serialize the whole deployment through smoke checks.
4. Document coverage, configuration and read-only/manual execution. Run syntax and
   diff checks locally; automated tests only in GitHub Actions, per AGENTS.md.
5. Obtain a fresh code review and successful CI on the final commit. Merge the
   checked commit, then dispatch the read-only workflow for the existing deployed
   SHA and verify its result. Do not publish a new application release for CI-only
   changes or alter the current production application/database.

HTTP checks establish availability and deployment integrity; authenticated editing
and browser interactions remain covered by the pre-deployment integration suites.
