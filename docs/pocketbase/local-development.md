# Local PocketBase Development

Use this workflow when building or testing Organized Glitter locally. The local
PocketBase database is persistent and lives in `local-pb-db/pb_data`; do not spin
up disposable databases for normal app work or hook testing. Bootstrap it once
from the committed schema and fake records, then keep reusing the same local DB.

## What Is Committed

- `docs/pocketbase/collections.schema.json` is a sanitized PocketBase
  collections export.
- It contains schema configuration only: collections, fields, rules, auth
  settings, and indexes.
- It does not contain `pb_data`, SQL dumps, uploaded files, backups, or
  production records.

## One-Time Setup

Use the latest tested PocketBase executable for local development. The repository
installer pins PocketBase 0.40.4 and verifies its archive and binary checksums. The authentication upgrade test also installs a pinned 0.40.1 baseline.

Place the executable here:

```bash
local-pb-db/pocketbase
```

Then make it executable if needed:

```bash
chmod +x local-pb-db/pocketbase
```

The repository installer selects the current macOS or Linux archive, verifies
the official pinned SHA-256 checksum, and can place the executable there:

```bash
pnpm pb:install:test -- --destination=local-pb-db/pocketbase
```

Cursor Cloud and other Linux amd64 checkouts can install the matching 0.40.4
binary with:

```bash
mkdir -p local-pb-db
curl -fsSL https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_linux_amd64.zip -o /tmp/pocketbase_0.40.4_linux_amd64.zip
unzip -o /tmp/pocketbase_0.40.4_linux_amd64.zip pocketbase -d local-pb-db
chmod +x local-pb-db/pocketbase
```

Check the production version separately before deployment. Local tests use the
repository pin so a newer release can be checked before production upgrades.

`local-pb-db/` is gitignored and should stay local to each machine or cloud
agent checkout. Keep `local-pb-db/pb_data` as the durable local test database.

If you need to allow a different local frontend origin, set a comma-separated
origin list before starting PocketBase:

```bash
LOCAL_POCKETBASE_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 pnpm pb:bootstrap:local -- --seed
```

Without `LOCAL_POCKETBASE_ALLOWED_ORIGINS`, the bootstrap script allows Vite
dev ports `3000`, `3001`, `3002`, and `5173` on both `localhost` and
`127.0.0.1`.

## Upgrade an existing local installation

Preserve the existing `local-pb-db/pb_data` database and uploaded files when
upgrading. Do not bootstrap or reseed just to replace the executable.

1. Stop the local PocketBase process, then back up the complete `local-pb-db/`
   directory, including the previous executable.
2. Download the release for the host platform and verify its archive against the
   official release checksums. Rehearse the upgrade on a copy of the local data
   before replacing the persistent installation.
3. Replace `local-pb-db/pocketbase` with the verified executable and make it
   executable.
4. Inspect the local schema and migration history, then copy only the required
   migrations into `local-pb-db/pb_migrations/`. Do not copy the complete repo
   migration history into an existing database without reconciling it first.
5. Run `pnpm pb:local`. The startup script syncs the current repo hooks; PocketBase
   applies pending migrations on startup. The script does not copy migrations.
6. Verify the version, health endpoint, login, expected indexes, and existing
   records before using the upgraded database for normal development.

For the PR 175 note-query changes, the selected migration is
`1788654277_updated_coloring_page_progress_notes.js`. It adds two indexes to
`coloring_page_progress_notes`; check for local custom indexes before applying it.

## Environment

The bootstrap script loads `.env`, then `.env.local`. Environment variables set
by the shell take precedence over both files, and `.env.local` can override
values from `.env`.

Use local-only values for bootstrap. If these script variables are not set, the
script uses these defaults:

```dotenv
LOCAL_POCKETBASE_URL=http://localhost:8090
LOCAL_POCKETBASE_ADMIN_EMAIL=admin@localhost.dev
LOCAL_POCKETBASE_ADMIN_PASSWORD=admin123456
LOCAL_POCKETBASE_TEST_USER_EMAIL=sarah-local@example.test
LOCAL_POCKETBASE_TEST_USER_PASSWORD=local-test-password-123
```

Set the frontend URL in `.env.local` when you want the app shell to use local
PocketBase:

```dotenv
VITE_POCKETBASE_URL=http://localhost:8090
```

The script refuses non-local `LOCAL_POCKETBASE_URL` values. It also refuses
`VITE_POCKETBASE_URL` when that variable is set to a non-local URL, including
the production PocketBase host. If you copied `env.template` or `.env.example`,
override `VITE_POCKETBASE_URL` in `.env.local`, or set it in the command
environment before bootstrapping.

`LOCAL_POCKETBASE_URL` may use `localhost`, `127.0.0.1`, or bracketed IPv6
loopback like `http://[::1]:8090`. When no port is provided, the script
normalizes the URL to port `8090`.

Do not use production admin credentials for local bootstrap.

Set `LOCAL_POCKETBASE_DIR` only for isolated automation. The release QA harness
uses it to create a fresh disposable PocketBase directory under
`.tmp/pocketbase-release-qa/<run-id>/pocketbase` without touching the persistent
`local-pb-db/pb_data` database.

CI migration validation uses a separate disposable directory under
`.tmp/pocketbase-upgrade/`. Given a base commit, it imports that commit's
sanitized schema with the pinned 0.40.1 baseline, applies only new migration
files added by the change, then compares the result with a PocketBase 0.40.4
import of the current schema. PocketBase 0.40.4 rejects legacy index metadata
that ends in a semicolon, so the previous-schema import also applies
`scripts/fixtures/production-index-inventory.json` and strips those terminators
before the 0.40.1 collections import:

```bash
pnpm pb:validate:upgrade -- --base-ref=origin/dev
```

This is a bounded prior-schema contract. It does not replay the archived or
complete historical migration set, because those files may not match an
existing database's recorded history. A committed schema contract change must
have a new forward migration. Files already present under `pb_migrations/` at
the base commit are immutable; modify the schema with another additive
migration instead of editing, renaming, or deleting an earlier one.

The upgrade fixture also verifies that a representative existing user survives.
It does not prove migration-specific backfills or preservation for every
collection. Migrations that transform record data still need focused seeded
tests for their own old and new value contract.

## Bootstrap

### Choose the right command

| Task                                                           | Command                                            | Notes                                                                                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create or intentionally refresh the persistent local DB        | `pnpm pb:bootstrap:local -- --seed`                | Imports `docs/pocketbase/collections.schema.json` unless `local-pb-db/pb_schema.json` exists, syncs repo hooks into `local-pb-db/pb_hooks`, and idempotently upserts seed data. |
| Validate schema import without leaving PocketBase running      | `pnpm pb:bootstrap:local -- --seed --no-keepalive` | Useful for CI-style checks. Stops only the PocketBase process started by the script.                                                                                            |
| Start the existing persistent local DB for app or hook testing | `pnpm pb:local`                                    | Normal day-to-day command. It preserves `local-pb-db/pb_data` and syncs repo hooks into `local-pb-db/pb_hooks` before serving.                                                  |
| Start the existing local DB for LAN browser testing            | `pnpm pb:lan`                                      | Binds PocketBase to `0.0.0.0:8090` and adds the detected LAN app origin to CORS. Use only on trusted networks.                                                                  |

For first-time setup, or when you intentionally need to refresh local schema,
start local PocketBase, import the schema, and keep the server running:

```bash
pnpm pb:bootstrap:local
```

For first-time setup with fake records:

```bash
pnpm pb:bootstrap:local -- --seed
```

The bootstrap script imports schema from `local-pb-db/pb_schema.json` when that
file exists. Otherwise it uses the committed
`docs/pocketbase/collections.schema.json`.

For one-shot validation or CI-style checks, add `--no-keepalive` so the script
starts PocketBase, imports the schema, optionally seeds records, and then stops
the server process it started:

```bash
pnpm pb:bootstrap:local -- --seed --no-keepalive
```

If PocketBase is already running at `LOCAL_POCKETBASE_URL`, the script reuses
that server and leaves it running.

For normal local app work after bootstrap, use:

```bash
pnpm pb:local
```

That command does not import schema or recreate records. It serves the durable
database in `local-pb-db/pb_data`.

## Fake Seed Data

`--seed` idempotently upserts fake local records with fixed IDs, so rerunning the
command updates the same records instead of creating duplicates. The seed set
includes:

- one verified test user
- dashboard settings, including randomizer next-up preferences
- diamond painting projects in wishlist, stash, progress, and completed states
- related companies, artists, tags, project tags, and progress notes
- coloring book, page, medium, tag, progress note, and randomizer examples

Default app login for the seeded test user:

```txt
Email: sarah-local@example.test
Password: local-test-password-123
```

Override those values with `LOCAL_POCKETBASE_TEST_USER_EMAIL` and
`LOCAL_POCKETBASE_TEST_USER_PASSWORD` when you need a different local test login.

## Run The App Locally

In a second terminal:

```bash
pnpm dev:local
```

Use `pnpm dev:local` for local database testing. It points the frontend at
`http://localhost:8090` and uses the Vite dev server, so it does not require
cloud deployment credentials.

### Run The App From Another Computer On Your LAN

Use the LAN commands when you want to open the local app from another computer,
phone, or tablet on the same trusted network. They keep using the same persistent
PocketBase database in `local-pb-db/pb_data`.

In the first terminal:

```bash
pnpm pb:lan
```

In a second terminal:

```bash
pnpm dev:lan
```

The scripts detect your LAN IP from `ipconfig getifaddr en0`, then `en1`, with a
Linux `hostname -I` fallback. The Vite command prints the app URL, usually in
this form:

```txt
http://192.168.1.50:3000
```

Open that URL from the other device. If the automatic interface detection picks
the wrong address, set it explicitly for both commands:

```bash
LOCAL_LAN_HOST=192.168.1.50 pnpm pb:lan
LOCAL_LAN_HOST=192.168.1.50 pnpm dev:lan
```

You can also choose a different frontend port:

```bash
LOCAL_FRONTEND_PORT=3002 pnpm pb:lan
LOCAL_FRONTEND_PORT=3002 pnpm dev:lan
```

Allow incoming connections if macOS prompts for `node` or `pocketbase`. Do not
use the LAN commands on public or untrusted networks; PocketBase is intentionally
reachable from other devices while `pnpm pb:lan` is running.

Run E2E tests against the persistent local database with the seeded user:

```bash
VITE_POCKETBASE_URL=http://localhost:8090 \
E2E_TEST_EMAIL=sarah-local@example.test \
E2E_TEST_PASSWORD=local-test-password-123 \
E2E_FIXTURE_PROJECT_ID=localproject003 \
pnpm test:e2e
```

For release QA against an ephemeral local database, use:

```bash
pnpm qa:release:local
```

That command provisions its own PocketBase data directory, seeds the same local
fixtures, starts the web app on localhost, runs Playwright, captures logs and
artifacts, and stops the services. It is the preferred future Codex workflow
for dev to main release checks.

## Test PocketBase Hooks Locally

Local hook testing uses the same persistent DB in `local-pb-db/pb_data`.
PocketBase runs from `local-pb-db/`, so it reads hooks from
`local-pb-db/pb_hooks/`, not directly from repo-root `pb_hooks/`.

`pnpm pb:local` and `pnpm pb:bootstrap:local` both copy repo-root
`pb_hooks/*.js` into `local-pb-db/pb_hooks/` before serving. Both commands stop
if the local hooks directory has extra JavaScript files. Move or trash those
files before retrying so stale routes cannot load. Use
`pnpm pb:local` for production-style local hook testing:

```bash
pnpm pb:local
```

When diagnosing hook internals and you need PocketBase `--dev` logging, still
use the same persistent DB and synced hooks:

```bash
pnpm pb:local -- --dev
```

`--dev` prints SQL and hook runtime errors. This is useful for a generic
PocketBase client response like `Something went wrong while processing your
request`.

See [`hooks.md`](hooks.md) for JSVM route callback scope notes and production
upload cleanup steps.

## Validate Schema

Before committing a refreshed schema export:

```bash
pnpm pb:validate:schema
```

This checks that the committed schema is a collections array, has no obvious
record rows or secret-looking values, and matches the collection names in
`src/types/pocketbase.types.ts`.

## Refresh The Committed Schema

From the production PocketBase dashboard:

1. Go to Settings.
2. Export collections.
3. Save the JSON locally.
4. Review it for schema-only contents.
5. Replace `docs/pocketbase/collections.schema.json`.
6. Run `pnpm pb:validate:schema`.

Do not export or copy production records.

## Reset Local Data

Reset local data only when you intentionally want to rebuild the persistent
local DB from scratch:

```bash
trash local-pb-db/pb_data
pnpm pb:bootstrap:local -- --seed
```

Use `trash`, not `rm`, for local database deletion.

## Troubleshooting

### Missing local PocketBase binary

If bootstrap reports `Missing local PocketBase binary`, download the matching
PocketBase release and place the executable at `local-pb-db/pocketbase`.

### Bootstrap refuses `VITE_POCKETBASE_URL`

The script reads `.env` and `.env.local` before starting PocketBase. Set
`VITE_POCKETBASE_URL=http://localhost:8090` locally, or remove that variable
from the files used during bootstrap.

For cloud checkouts with placeholder `.env` values, prefix the command instead
of editing the file:

```bash
VITE_POCKETBASE_URL=http://localhost:8090 pnpm pb:bootstrap:local -- --seed
```

### Schema and generated types disagree

Run:

```bash
pnpm pb:validate:schema
```

The validator compares collection names in
`docs/pocketbase/collections.schema.json` with `src/types/pocketbase.types.ts`.
When the canonical schema changes, refresh both artifacts intentionally and
review the diffs before committing.

## Cloud Agent Notes

Cloud agents such as Cursor should use the committed schema and fake seed data.
They should not need production server access, production credentials, backups,
SQL dumps, or uploaded files.

### Cursor Cloud startup

Cursor Cloud checkouts may include placeholder values in `.env`. Because the
bootstrap script loads `.env` before `.env.local` and rejects production-looking
`VITE_POCKETBASE_URL` values, set the local frontend URL in the command
environment. Shell environment variables take precedence over `.env` and
`.env.local`:

```bash
VITE_POCKETBASE_URL=http://localhost:8090 pnpm pb:bootstrap:local -- --seed
```

That command starts PocketBase on port 8090, imports the committed schema, seeds
fake records, and keeps the PocketBase process running. Start the app in a
second terminal:

```bash
pnpm dev:local
```

`pnpm dev:local` starts Vite on port 3000 and points the frontend at
`http://localhost:8090`; it does not require cloud deployment credentials.

After that initial bootstrap, use `pnpm pb:local` in later sessions so the
cloud checkout reuses the same `local-pb-db/pb_data` database instead of
refreshing schema and seed data every time.

### Cursor Cloud validation commands

Use these checks when validating changes in a cloud checkout:

```bash
pnpm test
pnpm build
```

`pnpm test` does not require PocketBase or any other external service. The
`pnpm build` package script supplies `VITE_APP_VERSION=local-build` by default.
Direct `vite build` still needs a build identifier from `VITE_APP_VERSION`,
`GITHUB_SHA`, or `RAILWAY_GIT_COMMIT_SHA`.

## Authentication deployment compatibility

PocketBase 0.40.4 rejects legacy index metadata ending in a semicolon. Apply
`1789940323_normalize_legacy_index_metadata.js`,
`1789940323_repair_production_book_indexes.js`, and
`1789940323_repair_production_page_indexes.js` before the verified-email migration.
These remove only known legacy statement terminators from collection metadata,
preserves custom definitions, and leaves physical indexes unchanged. Its rollback
keeps the valid metadata rather than restoring definitions that 0.40.4 rejects.

The required `pnpm pb:test:auth-verification` check defaults to checksum-verified
0.40.1 and 0.40.4 binaries. To use separately verified executables:

```bash
node scripts/test-auth-verification.mjs --baseline-binary=/path/to/0.40.1/pocketbase --binary=/path/to/0.40.4/pocketbase
```

The disposable test checks physical index preservation, metadata normalization,
OAuth account backfill, unverified-token invalidation by rotating the users
auth-token secret, and verified-user access. Its baseline
uses the complete production index inventory exported on September 20, 2026,
including valid indexes absent from the earlier repository snapshot.
