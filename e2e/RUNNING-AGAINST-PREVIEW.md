# Running browser checks against a deployed preview

The curated local release check is `pnpm qa:browser:full`, which provisions
disposable PocketBase data. For every project in the developer Playwright
config, use the [complete disposable run](../docs/testing-playwright.md).
`pnpm test:e2e` uses the persistent local developer setup. On Spacefast, use
`pnpm test:e2e:spacefast` by default. It runs four tests: real login setup
and three read-only journeys covering public pages, signed-in routes, and
mobile Safari. Each journey reuses one browser context and waits 15 seconds between
page loads. It runs with one worker, no retries, and stops after the first
failure so an HTTP 429 does not trigger more browser traffic. Each run writes
`run.json`, an HTML report, and failure artifacts under
`.tmp/spacefast-preview-qa/<run-id>/`.

This is a hosted acceptance check, not a replacement for the full local suite.
Follow the [backend environment boundary](../docs/agents/backend-environment-safety.md)
before choosing a target or writing fixtures.
Run focused additional read-only journeys when a change needs them, using small
batches and leaving time for the preview limit to reset. A red hosted run still
needs investigation; do not assume every failure is rate limiting.

## The local-env footgun

`playwright.config.ts` and `e2e/fixtures/auth.setup.ts` both layer
`.env.e2e.local` ON TOP of `.env.e2e`. `.env.e2e.local` holds values for a
LOCAL PocketBase, and against a hosted preview those values are wrong in three
places:

- `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` - the local account does not exist on
  the preview backend, so login fails and every authenticated test is blocked.
- `VITE_POCKETBASE_URL=http://localhost:8090` - direct-PocketBase specs
  (`import-export-local`, `cover-image-update`) hit a dead localhost backend.
- `E2E_FIXTURE_PROJECT_ID=localproject003` - fixture-dependent specs request a
  project that only exists locally and 404 against the preview, so they SKIP
  silently (they look "passed/skipped", not "failed").

CI is unaffected: it has no `.env.e2e.local`, so the hardcoded prod-fixture
defaults in the specs apply.

## Spacefast recipe (run from repo root)

```sh
# 1. credentials: source ONLY .env.e2e (NOT .env.e2e.local)
set -a; . ./.env.e2e; set +a

# 2. point at the preview's backend (prod PocketBase) and its fixtures
export VITE_POCKETBASE_URL=https://data.organizedglitter.app
export E2E_FIXTURE_PROJECT_ID=n5zfnqdq3zzwso0
export E2E_COLORING_BOOK_ID=kgs059794affuba
export E2E_COLORING_PAGE_ID=m6wzlm2hn2x82g4
export E2E_COLORING_MEDIUM_ID=gug3x3ufw5hj7fv
export E2E_RANDOMIZER_PROJECT_IDS=2s8feo1t3w4cwny,gpi34djxp45vpve,qkirrty89c0u2w9,9y984d1znv4yju2,9xt8wbkrd4s1p4k,voljswe2ngmdaf8,bp0z4t73q8orpt7,51oedioebsc1o4t

# 3. Use the clean URL. For a private preview, provide an existing authorized
# Playwright storage-state file containing the Spacefast viewer session.
export E2E_APP_URL=https://organized-glitter-preview.view.fast
export E2E_ACCESS_STORAGE_STATE=/absolute/path/to/ignored/access-state.json

pnpm test:e2e:spacefast
```

Do not put a Spacefast access token in `E2E_APP_URL`, commit the storage-state
file, or print its contents. Omit `E2E_ACCESS_STORAGE_STATE` for a public space.
`E2E_STORAGE_STATE` optionally changes the output path for the signed-in session;
it must be a non-empty relative path within the repo and resolves from the repo
root.
The runner requires the credential and fixture variables to be exported before
Playwright starts, preventing `.env.e2e.local` from supplying local credentials
or a localhost PocketBase URL. It does not start a local Vite server.

For a full hosted sweep when explicitly needed, use a separate temporary
Playwright config and run focused read-only groups with pauses. Do not use the
full suite as the routine private Spacefast preview check: repeated fresh
browser contexts have produced asset 429 responses and upstream failures.
Do not bypass the localhost guards in mutating suites.

## Coloring and randomizer fixtures

The coloring fixture IDs above are seeded by
`scripts/seed-e2e-coloring-fixture.mjs`. This script writes records; apply the
shared backend environment boundary before running it.

The randomizer wheel-key a11y fixture IDs are seeded by
`scripts/seed-e2e-randomizer-fixture.mjs`. This script writes eight `progress`
diamond projects. Apply the same boundary before running it.
Print output is `E2E_RANDOMIZER_PROJECT_IDS=...`.

## Local-safety guard behavior

Most mutating specs call `assertLocalE2ETargets` from
`e2e/fixtures/local-safety.ts`. That helper **skips** (via `test.skip`) when
the app or PocketBase URL is not localhost. It still refuses to run mutating
setup against hosted targets; those tests count as **skipped**, not failed, so
serial siblings stay readable. Specs such as `import-export-local` and
`archive-recovery-local` also use describe-level `test.skip` for the same
guard.

A typical hosted run therefore shows many intentional local-only skips rather
than a wall of guard failures. The earlier classification (when guards threw)
is documented in
[`docs/audits/preview-e2e-verification-2026-09-09.md`](../docs/audits/preview-e2e-verification-2026-09-09.md).

## Note on remaining skips

Some specs (screen-review atlas, route-mount, authenticated-a11y) resolve
fixtures by their own discovery/inventory rather than the env IDs above, so they
may still skip against a preview. A serial full run against shared prod
PocketBase also shows run-to-run timing variance (15s waits occasionally time
out under load). These are not failures; do not treat a single full-run skip
list as authoritative.
