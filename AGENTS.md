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

Run automated test suites only when merging changes into the repository, unless
the user explicitly requests a test run. Do not run them for routine edits or
local previews. Visual inspection and local page/API availability checks remain
part of the preview workflow.
