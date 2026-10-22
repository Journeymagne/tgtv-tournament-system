# Local previews for user testing

Whenever deploying or starting this project locally for the user to test, complete
administrator autologin before handing over the preview. This is the user's standing
instruction; do not ask again whether to create a local test administrator or sign in.

- Verify that the app and database are local. Use a dedicated, reusable local test
  administrator, such as `LocalPreviewAdmin`, and a normal application session.
- Open the preview already authenticated, or configure the local preview launcher so
  opening or refreshing the supplied local URL automatically signs the user in.
  Signing in only inside the agent's separate browser does not satisfy this rule.
- Keep any autologin helper and session material in ignored local runtime files under
  `work/`. Keep production authentication unchanged and never enable autologin for a
  remotely hosted app or a remote/production database.
- Verify the static page and `/api/me`, including `user.isAdmin === true`, and check
  that administrator controls are available. Give the user the ready-to-use local URL
  instead of a list of accounts with unknown passwords or a manual login requirement.
- If the user explicitly requests anonymous access or testing another role, follow
  that request for the relevant preview.

# Automated tests

The full automated test suite runs in GitHub Actions CI (`.github/workflows/ci.yml`)
on pushes and pull requests to `main`. CI runs `npm test` with a dedicated
PostgreSQL test database.

Do not run automated tests locally, including before merging into `main`, unless
the user explicitly requests a local run. Check the CI result for the relevant
commit and diagnose failures from the failed job's logs. Do not treat an older
successful run as validation of newer changes.

Visual inspection and local page/API availability checks remain part of the
preview workflow.
