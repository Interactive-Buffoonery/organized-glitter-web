# Playwright Smoke Tests

Run the browser smoke suite with:

```bash
pnpm exec playwright test
```

For the production-build browser smoke, use the disposable PocketBase harness:

```bash
pnpm qa:browser
```

That command creates a fresh local PocketBase data directory under
`.tmp/pocketbase-release-qa/<run-id>/`, imports the committed schema, syncs
`pb_hooks/`, seeds fake `.test` users and fixture records, builds `dist/`, and
serves that bundle through `server/local-build-server.js` on a free localhost port.
It then runs the fixed Chromium and iPhone WebKit smoke inventory and stops both
background processes. It never reads or writes `local-pb-db/pb_data` and does
not require E2E repository secrets.

This local server does not run Spacefast Functions. Use
`pnpm test:e2e:spacefast` against the hosted preview to verify Spacefast behavior.

The smoke inventory covers public startup and login accessibility, real UI
login, project create and edit persistence, coloring book creation through the
UI and generated page editing, archive recovery, the notes timeline, structural
accessibility, and four mobile WebKit menu and drawer interactions. It sets
retries to zero and runs a list preflight, so a bad filter or retry cannot turn a
missing test into a green result. Required seed fixtures are checked before
Playwright starts.

For the curated Chromium and WebKit release inventory, use:

```bash
pnpm qa:browser:full
```

Both harness inventories explicitly exclude `e2e/screen-review/`. The screen
atlas remains a separate visual-review tool and is not a CI correctness gate.

For the complete developer Playwright inventory, including all authenticated
specs and the three screen-review projects, use the disposable harness with
every project selected:

```bash
pnpm qa:release:local -- --project=public --project=authenticated --project=screen-review-desktop --project=screen-review-mobile-chrome --project=screen-review-mobile-safari
```

This uses `playwright.config.ts` against the harness's isolated app and
PocketBase servers. The `setup` project runs through the selected projects'
dependencies, and its auth state stays in the run directory. This is broader
than `pnpm qa:browser:full`; expect a longer run. Direct `pnpm test:e2e` uses
the persistent developer setup.

Default artifacts:

- `.tmp/pocketbase-release-qa/<run-id>/release-qa-report.md`
- `.tmp/pocketbase-release-qa/<run-id>/logs/`
- `.tmp/pocketbase-release-qa/<run-id>/artifacts/playwright-report/`
- `.tmp/pocketbase-release-qa/<run-id>/artifacts/test-results/`

The harness and direct-mutating E2E specs refuse non-local app or PocketBase
URLs. Use them only with fake local records. The older focused interface remains
available through `qa:release:local`; pass normal Playwright filters after `--`:

```bash
pnpm qa:release:local -- --project=authenticated e2e/authenticated/route-mount.spec.ts
```

Run the focused accessibility subset with:

```bash
pnpm test:e2e:a11y:local
```

Playwright loads E2E env values in this order: `.env.e2e`, then
`.env.e2e.local`, then exported process environment variables. Later sources
win. The local accessibility runner and screen-review runner use the same
precedence, start the Vite app through Playwright's `webServer`, and run their
focused suites. Authenticated setup validates the required login settings
before signed-in tests run.

The local accessibility runner requires a fresh Vite server so `APP_TEST_ENV=test`
can disable developer overlays that intercept mobile taps. Stop an existing
preview on the test port first, or choose another loopback port allowed by your
local PocketBase CORS settings with `E2E_APP_URL` and a matching
`E2E_WEB_SERVER_COMMAND`. For example, use `http://localhost:3001` with
`pnpm dev --host 127.0.0.1 --port 3001 --strictPort`. An occupied port fails
rather than silently reusing a server started with different settings.

Use `.env.e2e.local` with these seeded values when testing against the
persistent local PocketBase database:

```bash
VITE_POCKETBASE_URL=http://localhost:8090
E2E_TEST_EMAIL=sarah-local@example.test
E2E_TEST_PASSWORD=local-test-password-123
E2E_FIXTURE_PROJECT_ID=localproject003
```

The local accessibility command refuses non-loopback PocketBase or app URLs
before starting Playwright. It accepts HTTP(S) URLs on `localhost`, `127.0.0.1`,
and `[::1]`, without embedded credentials. Use `E2E_APP_URL` to select another
local app port.

Run either focused suite directly when debugging one half of the coverage:

```bash
pnpm test:e2e:a11y:public
pnpm test:e2e:a11y:authenticated
```

Authenticated tests need either `.env.e2e.local`, `.env.e2e`, or exported
environment variables. The app server also needs `VITE_POCKETBASE_URL`, because
Playwright starts Vite locally:

```bash
VITE_POCKETBASE_URL=...
E2E_TEST_EMAIL=...
E2E_TEST_PASSWORD=...
```

Public axe scans include color contrast. Authenticated axe scans currently focus
on structural rules and skip `color-contrast` so existing signed-in theme debt
does not hide regressions in semantics, roles, focusability, or labels.

The shared axe helper waits for the startup splash to detach, the app root to
reach full opacity, and fonts to settle before scanning. A visible main element
can still be fading in or covered by the splash, which changes the contrast
measured by Linux WebKit.

`e2e/authenticated/mobile-touch-targets.spec.ts` reuses that settle path, then
waits for coarse-pointer media and the bottom nav (so `useMobileDevice` has
left its desktop initial state) before size asserts. Touch-target checks poll
until the box is frame-stable at >= 44px rather than reading `boundingBox()`
once after `toBeVisible`. That keeps the WCAG/HIG sizing contract while
avoiding the INT-1057 flake under full-suite contention.

Install browser engines locally before running the full browser matrix:

```bash
pnpm exec playwright install chromium webkit
```

The screen-review command runs desktop Chrome and mobile Chrome on every local
run. If Playwright WebKit is not installed locally, it skips the mobile Safari
screen review with an explicit setup message so Chrome results still finish.
CI must have WebKit installed. If `CI=true` and WebKit is missing, the runner
fails before the suite starts and prints the install command.

CI downloads the build job's `dist/` artifact and runs the same harness with
fixed loopback ports. Browser failures retain the HTML report, test results,
server logs, and the Markdown run report under
`.tmp/pocketbase-release-qa/ci/`. CI installs both Chromium and WebKit and does
not use a shared cloud backend or stored credentials.

When running authenticated specs with an iPhone WebKit device profile, assert the
mobile presentation: photo-import review uses cards, and Manage Lists is inside
the account menu. Opening that menu must preserve its accessible dialog name and
description without Radix title warnings. Let the drawer primitives generate and
connect their title and description IDs.

## Randomizer interruption regression

`e2e/authenticated/randomizer-interruption-local.spec.ts` covers three
interruption scenarios on the `/randomizer` route against local PocketBase:

1. **Clear/restore cancellation**: deselecting all items during an active spin
   cancels the session and allows a fresh spin after restoring the selection.
2. **Wheel click activation**: clicking the wheel element starts a spin the same
   way the button does.
3. **Keyboard page pick**: after a coloring-book spin result, the page-pick
   action is reachable via keyboard (Enter) and announces the picked page.

The spec runs in both Chromium and iPhone WebKit inventories within the
disposable QA harness. It requires `reducedMotion: 'no-preference'` so the wheel
animation fires completion events.

## Local image-selection regression

The avatar crop regression saves a 1:1 avatar through both compression passes
and checks the 200px preview before upload. It then reloads the page and checks
that the saved avatar loads from PocketBase. The local build server permits the
configured loopback PocketBase origin in `connect-src` and `img-src` only when
`APP_TEST_ENV=test`; production response headers keep their existing policy.
Run it with disposable local fixtures:

```bash
pnpm qa:release:local -- --suite=full --project=authenticated-chromium-full e2e/authenticated/avatar-crop-local.spec.ts --retries=0
pnpm qa:release:local -- --suite=full --project=authenticated-webkit-full e2e/authenticated/avatar-crop-local.spec.ts --retries=0
```

The local image-selection regression replaces a large image while compression is
pending, crops the replacement, and checks the pixels saved to PocketBase. Run it
against disposable local fixtures in both engines:

```bash
pnpm qa:release:local -- --project=authenticated e2e/authenticated/image-selection-local.spec.ts --retries=0
E2E_IMAGE_BROWSER=webkit pnpm qa:release:local -- --project=authenticated e2e/authenticated/image-selection-local.spec.ts --retries=0
```

## Hosted preview runs

Keyboard tests must wait for `#root[data-app-ready="true"]` and for `#root`
to lose `inert` before sending keys. Content can already be in the DOM while
the startup splash is fading, but it cannot receive keyboard focus yet.

The local harness and CI both target localhost. To run the suite against a
deployed Railway preview (or any other hosted environment), see the recipe in
[`e2e/RUNNING-AGAINST-PREVIEW.md`](../e2e/RUNNING-AGAINST-PREVIEW.md). The key
differences:

- Override `baseURL` to the preview URL and disable `webServer`.
- Source hosted-environment credentials and fixture IDs instead of the local
  `.env.e2e.local` values.

### Local-safety guards on hosted runs

Specs that mutate data call `assertLocalE2ETargets` from
[`e2e/fixtures/local-safety.ts`](../e2e/fixtures/local-safety.ts). This helper
**skips** (via `test.skip`) when the app or PocketBase URL is not localhost. It
still refuses to mutate non-local targets; hosted preview runs just report those
specs as skipped instead of failed. Specs such as `import-export-local` and
`archive-recovery-local` also use describe-level `test.skip` for the same
guard.

When reading older hosted-run results from before this skip behavior, classify
guard failures separately from real product bugs. The
[preview E2E verification report](./audits/preview-e2e-verification-2026-09-09.md)
documents one full classification pass from that earlier state.

## Coloring date editor navigation regression

Navigation cleanup must preserve successful query entries. Query labels such as
`coloring-pages` and `coloring-books` are namespace strings, not record IDs.
Treating those labels as malformed IDs evicted loaded data 100 ms after navigation,
briefly replaced the page with its loading state, and erased a newly typed date.
The regression in `src/utils/query/__tests__/cacheValidation.test.ts` advances the
navigation cleanup timer with real query keys and verifies that loaded entries
survive. Cleanup still removes queries with confirmed 404 responses. The coloring
book creation browser test covers editing and saving the newly generated page.
