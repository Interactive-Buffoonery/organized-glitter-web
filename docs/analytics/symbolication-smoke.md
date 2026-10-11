# Safe symbolication smoke validation

This procedure validates a synthetic stack locally. It sends no telemetry,
uses no credentials and creates no PostHog project. Never generate a fake
production error, run a capture in CI, or use real account data in a fixture.

## Offline check

```bash
VITE_PUBLIC_POSTHOG_KEY= VITE_PUBLIC_POSTHOG_HOST= \
  pnpm exec vitest run scripts/__tests__/symbolication-smoke.test.mjs \
  scripts/__tests__/upload-sourcemaps.test.mjs
```

The test-only fixture lives in `test/fixtures/symbolication-smoke.mjs` outside
the app. It rejects production, preview and CI capture-like execution. The
automated test builds only that fixture in memory with hidden source maps,
evaluates its synthetic local Error in a sandbox with no network APIs or SDK,
and maps the minified stack frame to the original Error line using Node's
local SourceMap consumer. Nothing is written to the deployable bundle.
The test explicitly simulates a local context even when CI runs the offline
mapping test; this does not authorize or perform capture. CI must keep public
analytics configuration empty and must not run any ingestion smoke.

The existing uploader tests exercise release selection, injection and upload
arguments through stubs, map cleanup and failure handling. Real CLI injection
tests use synthetic files without an upload. Do not provide upload credentials
to these checks. Passing offline mapping proves fixture/source-map correctness,
not that the hosted PostHog symbolicator has received production artifacts.

## Production evidence review, without a new error

After an authorized release, an owner can use existing release build logs to
confirm injection/upload success and the exact release identifier. In the
existing project's Error Tracking interface, inspect an already received,
privacy-reviewed exception from that release. Verify original file, function
and line resolution against the same commit, and confirm no `.map` files are
publicly served. Keep exception details and stacks in the private project.
Report only release match and symbolication passed/failed/unavailable.

No existing suitable exception means hosted symbolication is unavailable,
not passed. A build that succeeded after an uploader warning is also not
upload evidence. Release enrichment and error-redaction changes belong to
their separate PRs. Missing release correlation blocks the hosted conclusion.

## Optional future nonproduction ingestion

This step is not authorized or executed by this PR. If offline checks and
existing evidence cannot resolve a hosted issue, obtain separate approval for
one manual smoke in an existing, verified nonproduction project and disposable
local app. Do not create a project or reuse production credentials. Stop if
the destination, source maps, consent or release cannot be verified.

Use only the fixed synthetic Error, the fixture's local environment guard and
a non-CI manual context. Keep consent/DNT/opt-out gates and disabled replay,
autocapture and automatic exception collection. Confirm the fixture source
map matches the exact injected chunk/release before capture. Record only
whether the known original throw line resolves, then remove local fixture
artifacts. Never add the fixture to the production app, collect user inputs,
export private stack data or weaken redaction to make this check pass.
