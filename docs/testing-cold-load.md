# Built-artifact cold-load regression tests

Run this suite when changing public HTML, the app bootstrap, startup recovery,
or eager module imports:

```bash
pnpm test:cold-load
```

The config builds the current checkout with Vite and serves `dist/` through
`server/local-build-server.js`. It uses Chromium and iPhone WebKit, one worker,
zero runner retries, empty storage state, and blocked service workers. Routing
disables the browser HTTP cache. Every test receives a fresh browser context.
There is no login setup, real account, PocketBase process, or deployment.
The app's configured backend URL points at the local test server, whose API
routes return 404. The public login form must still become usable.

Port 5184 is reserved for this run. An occupied port fails instead of reusing
another worktree's server. Choose a different local port when needed:

```bash
COLD_LOAD_PORT=5185 pnpm exec playwright test --config playwright.cold-load.config.ts
```

Focused runs and discovery:

```bash
pnpm exec playwright test --config playwright.cold-load.config.ts --list
pnpm exec playwright test --config playwright.cold-load.config.ts --project=chromium
pnpm exec playwright test --config playwright.cold-load.config.ts --grep 'dependency'
node --test e2e/ci/browser-inventory.test.mjs
```

Artifacts stay under `.tmp/cold-load-qa/`: `report/` contains the HTML report,
`results.json` contains machine-readable outcomes, and `results/` contains
failure screenshots and traces. Each test attaches `cold-load-requests`, a JSON
record of resource paths, query strings, request types, timestamps, and injected
and actual response statuses. Fault injection matches pathnames so adding a cache-busting query
cannot bypass a persistent failure.

Set `COLD_LOAD_ARTIFACT_DIR` to keep another run's report and traces separate,
for example `.tmp/cold-load-integration`.

## Coverage and integration contract

- Discover the actual app module and its static import graph from
  `dist/manifest.json`. Accept the existing shared `main` chunk and the planned
  `app.html` entry. Fail if the manifest cannot identify the app or an imported
  dependency; a skipped fault must never count as success.
- A clean `/login` loads the real app module, exposes Email and Password,
  marks `#root[data-app-ready="true"]`, and retires the startup overlays.
  Auth state, CacheStorage, and a controlling service worker remain absent.
- One 429 on the app entry or an imported dependency recovers without user
  interaction within 45 seconds. Retrying must respect `Retry-After: 1`, with a
  100 ms timing tolerance, and preserve the login query string and fragment.
  The HTTP-date case holds a dependency unavailable until the advertised time.
  A diagnostic fetch may read a module failure's status before the retry
  deadline because script error events do not expose response headers. The
  next attempt after a rate-limited diagnostic must wait until that deadline.
  These checks exercise real browser module failure caching, not mocked imports.
- A persistent entry or dependency 429 makes a bounded automatic attempt before
  exposing final recovery. The test permits at most eight requests for that
  resource, including status probes, and four document requests. Neither may
  change during the three seconds after final recovery is shown. Removing the
  fault and activating Try again must load the login form at the intended URL.
- A permanent 404 reaches final recovery without automatic document reloads.
  At most two requests for that path are allowed, accommodating the initial
  module request and a status probe. No more requests occur during the quiet
  observation period.
- Final recovery preserves the existing `#app-error` alert, accessible heading,
  and Try again button. The unfinished root stays inert. Desktop focus moves
  to Retry; Enter activates it. Mobile WebKit uses the visible button. Axe
  checks WCAG A and AA on the recovery surface.
- An initial app stylesheet 429 receives a real retry that respects
  `Retry-After`, returns HTTP 200 as a stylesheet, and attaches an enabled
  stylesheet with CSS rules. A status probe or an unstyled login is insufficient.
- `/` contains useful marketing content, semantic auth and legal links, and a
  main landmark in its raw HTTP response. `dist/index.html` does not reference
  the app entry module. With all app modules persistently blocked, public
  content remains visible and its Login link can navigate to the real app once
  the fault is lifted. A normal landing load requests no app modules and passes
  an Axe scan.
- With JavaScript disabled, the 320 px landing remains useful in Light and
  Dark. Privacy navigation reaches readable static content. Login navigation
  reaches `/login` and explains that the app needs JavaScript.
- `/dashboard`, `/projects/new`, `/coloring`, and `/profile` still return the SPA
  shell with HTTP 200 and redirect a clean signed-out context to the real login
  form. These checks verify protected-route delivery and the auth boundary;
  they do not establish signed-in workflows or backend correctness.

These bounds are explicit integration assumptions, not assertions derived from
the baseline implementation. Coordinate any different approved retry budget or
entry filename before changing the suite. Keep automatic recovery, manual
recovery, and runner retries distinct. The suite must remain expected-red until
the corresponding behavior exists.

## Baseline and parent-owned wiring

The initial baseline is `41a880714ae2e353bd9e457a9b40a7ffa201624e` on `dev`.
Client improvements are implemented in separate worktrees. This test lane must
not change HTML, `public/js/loading.js`, React imports, build implementation,
backend, or deployment settings to make the suite green.

The initial 36-case baseline run on 2026-10-06 finished with 14 passes and 22
expected failures, zero skips, and zero runner retries. Clean login, permanent
entry/dependency 404 recovery, and the four protected-route redirects passed in
both browsers. Entry/dependency automatic 429 recovery, persistent 429 automatic
attempts, HTTP-date recovery, stylesheet recovery, raw public HTML, blocked-SPA
landing, landing graph isolation, and both no-JavaScript appearances failed at
their intended seams. The report is `.tmp/cold-load-qa/report/index.html` and
machine-readable results are `.tmp/cold-load-qa/results.json` in the test
worktree. These failures were not skipped or changed into baseline assertions.

The final inventory also includes a separate manual-Retry accessibility control
so the automatic-retry failures cannot prevent that control from running.
It exposes an additional baseline issue: the white Try again label on
`#d63f7f` has 4.3:1 contrast rather than WCAG AA's required 4.5:1. Keep this
failure visible for the parent to address in `public/css/error.css`. The test
uses a soft assertion for Axe so it still exercises Retry and the real login;
the accessibility failure still makes the test fail.

The eight-case focused rerun of clean login, HTTP-date recovery, stylesheet
recovery, and manual Retry finished with two passes and six failures. A final
manual-Retry-only rerun confirmed that keyboard activation in Chromium and a
tap in mobile WebKit both reached a ready login form and fetched the app module
with HTTP 200. Both tests failed only the contrast assertion. Those final
artifacts are `.tmp/cold-load-manual-retry/report/index.html` and
`.tmp/cold-load-manual-retry/results.json`. The final inventory has 38 cases;
the initial 36-case run and focused reruns are separate evidence, not a green
integrated implementation run.

The three-second quiet window catches immediate retry loops; it does not prove
that no delayed timer exists. The bootstrap lane's focused timer tests must
verify the complete retry budget.

The spec is classified as affected/release coverage in
`e2e/ci/browser-inventory.mjs`. Existing public and authenticated project filters
do not select it. Run its dedicated config for the production artifact and
cache-isolation guarantees.

## Validation gate

`pnpm test:cold-load` runs the dedicated production-artifact config. Both
`pnpm test:pr` and `pnpm test:release` include this phase after PWA navigation.
Public HTML, bootstrap, and initial graph changes therefore receive this
coverage independently of the ordinary authenticated/public project filters.
The full browser inventory retains its separate smoke and release purposes.

The suite now also injects one initial 503 or network failure, native entry
and dependency 429s after successful warm fetches, and a native stylesheet
503 after warming. Native graph failures must recover in a fresh document,
preserve the URL, and append exactly one app entry in the recovered document.
A separate check blocks external shell scripts and CSS while verifying that
inline recovery remains styled and manual Retry reaches the real login form.
These additions bring the integration inventory to 54 cases across Chromium
and mobile WebKit. The original 38 cases and their assertions are retained.

The integration worktree initially has four known no-JavaScript Privacy
failures while the separately owned static legal follow-up is pending. Keep
these failures visible; the complete gate is not green until the legal
changes are integrated and the entire inventory passes. Test runner retries
remain zero. Keep hosted capture and provider throttling verification separate
from deterministic local fault-injection evidence.
