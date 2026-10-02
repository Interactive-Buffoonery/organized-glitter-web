# Development Scripts

This directory contains local development, validation, and maintenance helpers for Organized Glitter. Current app data lives in PocketBase.

## Prerequisites

- Node.js 24.x and pnpm 11.1.2 or newer.
- Project dependencies installed with `pnpm install`.
- `local-pb-db/pocketbase` installed when running local PocketBase scripts.
- A local-only `VITE_POCKETBASE_URL=http://localhost:8090` value when bootstrapping PocketBase.

## Setup

### `setup.mjs`

Cleans `node_modules` and `pnpm-lock.yaml`, then runs `pnpm install`.

```bash
pnpm setup
```

## CI helpers

- `node scripts/generate-not-found.mjs` generates `public/404.html` from the
  shared recovery content and HTML template. `--check` rejects stale output.
  `pnpm build` generates the page; static CI checks its committed version.
- `pnpm test:not-found` checks standalone HTTP 404 recovery and client-side
  recovery, matching copy, and keyboard navigation in Chromium and WebKit.
- `pnpm test:pr` runs the complete local merge gate.
- `pnpm build:budget` measures the generated eager shell and service-worker
  precache after `pnpm build`, writes `.tmp/bundle-budget/report.{md,json}`,
  and fails when either committed baseline plus 2% is exceeded.
- `pnpm lint:workflows` installs and verifies pinned actionlint, then validates
  every workflow. GitHub release downloads retry on 502/503/504 and network
  errors.
- `pnpm doctor` runs the pinned full React Doctor scan.
- `pnpm test:ci:react` runs the pinned changed-findings scan used by the React
  Doctor Action. It compares against `origin/dev` unless `CI_BASE_REF` is set.
- `pnpm qa:browser` builds and tests against disposable PocketBase data.
- `pnpm pb:validate:upgrade --base-ref=origin/dev` checks the backend upgrade path.
- `pnpm pb:test:auth-verification` tests verified API access against disposable
  PocketBase data.
- `pnpm pb:test:feedback` checks the authenticated feedback hook, mail handoff,
  identity validation, and account quota against disposable PocketBase.
- `pnpm pb:test:archive-restore-v3` runs canonical digest, multipart inventory,
  ownership, conflict, gallery order, metrics, retry, file rollback, and empty
  versus populated migration rollback checks against disposable PocketBase 0.40.4.
- `ci-result.mjs` rejects failed, cancelled, skipped, or missing required jobs.

See [CI](../docs/agents/ci.md) for exact commands and failure behavior.

## PocketBase Scripts

### `bootstrap-local-pocketbase.mjs`

Creates or intentionally refreshes the persistent local PocketBase database in
`local-pb-db/pb_data`, imports the committed schema, syncs repo hooks into
`local-pb-db/pb_hooks`, optionally seeds fake records, and keeps the server
running for app development.

```bash
VITE_POCKETBASE_URL=http://localhost:8090 pnpm pb:bootstrap:local -- --seed
```

Use `--no-keepalive` for CI-style validation where the script should stop the PocketBase process it started:

```bash
VITE_POCKETBASE_URL=http://localhost:8090 pnpm pb:bootstrap:local -- --seed --no-keepalive
```

Full workflow: [`docs/pocketbase/local-development.md`](../docs/pocketbase/local-development.md).

### `../start-local-dev.sh`

Starts the existing persistent local PocketBase database without importing
schema or recreating records. This is the normal command for app work and hook
testing after bootstrap:

```bash
pnpm pb:local
```

The script syncs repo-root `pb_hooks/*.js` into `local-pb-db/pb_hooks/`
before serving and stops if extra local JavaScript files remain. Move or trash
those files before retrying so local hook behavior matches the branch.

To expose the same local database to another computer on a trusted LAN, use:

```bash
pnpm pb:lan
pnpm dev:lan
```

The LAN variant binds PocketBase and Vite to all network interfaces, detects the
machine's LAN IP, and points the app at that LAN PocketBase URL.

### `validate-pocketbase-schema.mjs`

Validates that `docs/pocketbase/collections.schema.json` is a schema-only export and matches the generated TypeScript collection contract.

```bash
pnpm pb:validate:schema
```

### `install-pocketbase.mjs`

Downloads and checksum-verifies a pinned PocketBase binary for the current
platform. Shared by `bootstrap-local-pocketbase.mjs`,
`validate-pocketbase-upgrade.mjs`, and `run-local-release-qa.mjs`. The pinned
version and per-platform SHA256 hashes are exported constants.

### `validate-pocketbase-upgrade.mjs`

Validates the PocketBase backend upgrade path by comparing the current schema
against a base revision. It downloads the pinned PocketBase binary, boots a
temporary instance from the base revision's schema, applies newly introduced
migrations, and verifies the result matches the current committed schema.

The script detects changes in `docs/pocketbase/collections.schema.json` and
`pb_migrations/` relative to the base commit. When no relevant changes exist, it
exits early. Otherwise it:

1. Installs PocketBase into a temporary directory under `.tmp/pocketbase-upgrade/`.
2. Imports the base revision's schema and applies new migrations.
3. Compares the resulting schema against the current committed export.
4. Reports mismatches as failures.

```bash
pnpm pb:validate:upgrade --base-ref=origin/dev
```

The base ref defaults to `origin/dev` locally. In CI, it reads `GITHUB_BASE_SHA`
or `GITHUB_EVENT_BEFORE`. The script rejects null or all-zero SHAs.

### `validate-migration.cjs`

Performs static checks on PocketBase migration files before deployment.

```bash
pnpm pb:validate:migrations
node scripts/validate-migration.cjs pb_migrations/1778200000_create_coloring_tags.js
```

### `upsert-local-pocketbase-superuser.mjs`

Creates or updates the local PocketBase superuser record via a temporary
migration. Used by `bootstrap-local-pocketbase.mjs` and can be run standalone:

```bash
pnpm pb:create-admin
```

## Worktree Helpers

### `new-worktree.sh`

Creates a repo-local worktree under `.worktrees/`, branches from `origin/dev` by default, and symlinks local environment files from the main checkout.

```bash
scripts/new-worktree.sh feature/example
scripts/new-worktree.sh feature/example example-dir origin/dev
```

## Asset Generation

### `generate-app-icons.mjs`

Renders all PWA and favicon variants from the canonical
`docs/icons/app-icon-source.png` master using Playwright. Requires Chromium installed
(`pnpm exec playwright install chromium`). Outputs PNG files at the sizes and
variants defined in the export list (1024px native icon, 512px logo, 192/512 Android Chrome,
180px Apple Touch, maskable, and 32/16 favicons).

```bash
node scripts/generate-app-icons.mjs
```

The PNG master is the design source; `docs/icons/app-icon.html` only previews it.
After replacing it, review the source-specific crop settings, regenerate icons,
and update `APP_ICON_VERSION` in `scripts/app-icon-links.mjs` for every HTML entry.

### `test-color-references.mjs`

Disposable integration test for the `color_references.pb.js` hook route. Starts
a temporary PocketBase instance with the committed schema and hooks, creates a
test user, and exercises the transactional color reference route (upload, notes,
conflict detection, remove, archive restore with resumable receipts). Cleans up
the temporary directory on completion.

```bash
node scripts/test-color-references.mjs
```

## E2E fixture seeders

### `seed-e2e-coloring-fixture.mjs`

Idempotently creates the E2E coloring book, pages, and medium on the account
from `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`. Prints
`E2E_COLORING_BOOK_ID`, `E2E_COLORING_PAGE_ID`, and `E2E_COLORING_MEDIUM_ID`.

```bash
set -a; . ./.env.e2e; set +a
export VITE_POCKETBASE_URL=https://data.organizedglitter.app
node scripts/seed-e2e-coloring-fixture.mjs
```

### `seed-e2e-randomizer-fixture.mjs`

Idempotently creates eight `progress` diamond projects titled
`E2E Fixture Randomizer 01` through `08` so mobile randomizer wheel-key a11y
has a dense enough selected pool. A single fixture failure is logged and
skipped so the rest of the batch still attempts to seed. The script requires
all eight fixtures and exits non-zero with success and failure counts if any
fixture fails. On success, it prints `E2E_RANDOMIZER_PROJECT_IDS` for all eight
projects.

```bash
set -a; . ./.env.e2e; set +a
export VITE_POCKETBASE_URL=https://data.organizedglitter.app
node scripts/seed-e2e-randomizer-fixture.mjs
```

## Boundary Helpers

### `check-pb-boundary.sh`

Checks for PocketBase boundary violations.

```bash
pnpm lint:pb-boundary
```

## TypeScript Tooling

### `run-typescript-7.mjs`

Resolves the native TypeScript 7 compiler from `@typescript/native` and forwards
all command-line arguments to it. The supported commands are `pnpm typecheck`
for application validation and `pnpm tsc:ts7` for explicit native compiler
calls. The `tsc6` binary and `typescript` package provide the TypeScript 6
compatibility path used by ESLint and compiler API tooling.

```bash
pnpm typecheck
pnpm tsc:ts7 --version
```

Current observation, not supported: `pnpm exec tsc` presently resolves to the
native compiler through installed dependency and bin resolution. It is not a
canonical command and must not be relied on.

### `ensure-startup-script-order.mjs`

Keeps `/js/loading.js` ahead of Vite `type="module"` bundles in built HTML.
`vite.config.ts` runs it as a post `transformIndexHtml` hook. Without this,
production `index.html` can execute `/assets/main-*.js` before splash listeners
exist.

## LAN Development

### `start-local-app-lan.sh`

Starts the Vite dev server bound to all network interfaces for LAN access,
detecting the machine's LAN IP automatically.

```bash
pnpm dev:lan
```

## Test Helpers

### `run-playwright-a11y-local.mjs`

Runs the full local Playwright accessibility test suite in sequence (public, then
authenticated). This optional focused command is available through
`pnpm test:e2e:a11y:local`. The `pnpm test:pr` gate uses the disposable
`qa:browser` smoke harness instead.

Requires `.env.e2e` or `.env.e2e.local` with `VITE_POCKETBASE_URL`,
`E2E_TEST_EMAIL`, and `E2E_TEST_PASSWORD`.

```bash
pnpm test:e2e:a11y:local
```

### `run-local-release-qa.mjs`

Starts an isolated local PocketBase server from a fresh data directory under
`.tmp/pocketbase-release-qa/<run-id>/`, imports the committed schema, syncs
repo hooks, seeds deterministic fake records, builds the production bundle, and
serves it through the local build server on a free loopback port. It runs the
selected Playwright scope, writes artifacts
and logs under the same run directory, and stops the background services.

```bash
pnpm qa:release:local
```

Pass Playwright filters after the package script when debugging a narrower
release check:

```bash
pnpm qa:release:local -- --project=authenticated e2e/authenticated/route-mount.spec.ts
```

The runner refuses non-local app and PocketBase URLs, and the direct-mutating
E2E specs also assert localhost targets before creating or deleting records.
The default fake login is local only and uses `.test` email addresses. Do not
point this command at production or PikaPod data.

## Security Notes

- Never commit `.env`, local PocketBase data, backups, uploaded files, tokens, or admin credentials.
- Do not use production admin credentials for local bootstrap.
- Do not copy production `pb_data` into this repository.
- Use the sanitized schema export in `docs/pocketbase/collections.schema.json` for local agent and development work.
