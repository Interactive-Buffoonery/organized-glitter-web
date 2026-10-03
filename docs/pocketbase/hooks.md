# PocketBase JSVM Hooks

PocketBase hooks in `pb_hooks/` are production backend code. Test hook changes
against a local PocketBase server before uploading them to PikaPod.

## JSVM Callback Scope

PocketBase JSVM route and record-request callbacks do not reliably resolve
top-level helper bindings from the hook file at request time. A callback can
load successfully and still fail every request with a generic `400`:

```js
const YEAR_MIN = 1900;

function parseYear(e) {
  const year = Number(e.request.url.query().get('year'));
  return Number.isInteger(year) && year >= YEAR_MIN ? year : new Date().getFullYear();
}

routerAdd('GET', '/api/example', e => {
  const year = parseYear(e);
  return e.json(200, { year });
});
```

PocketBase may log the real local error as:

```txt
ReferenceError: parseYear is not defined
```

Keep small request-only helpers inside the callback, or load a committed helper
module with `require(__hooks + '/helper.js')` inside the callback. Do not rely
on top-level bindings from a hook file. This is especially important for query
parameter parsing, status allowlists, relation maps, label arrays, and response
mappers used only by one callback.

## Sign-in Method Proofs

Native Apple authentication is in `native_apple_auth.pb.js`; encrypted Apple
grant capture for the existing web OAuth flow is in `apple_grants.pb.js`. The
native route evaluates the same fail-closed condition as its public readiness
response and uses PocketBase's signed Apple token validation. Test the route
against disposable PocketBase 0.40.4 data with
`node scripts/test-native-apple-auth.mjs`. The test copies the production hook
and replaces only its provider fetch seam with disposable claims; no test
endpoint override exists in the production hook. Web grant capture is tested by
routing a disposable Discord OAuth fixture through a copied grant hook.

See [Apple grant operations](#apple-grant-operations) for capture, sign-in
limits, revocation, recovery, and the rollout audit. Authenticated link proof
consumption uses the surrounding grant transaction when one is active.

`pb_hooks/auth_sign_in_methods.pb.js` prevents email-only OAuth merging and
requires fresh verification before linking or unlinking a provider. Password
verification uses `POST /api/auth/step-up/password`; OAuth-only accounts verify
through an exact existing provider ID. Both paths create a five-minute,
single-use proof bound to user, action, and target provider.

Link attempts consume proof before `e.next()`, so any server-side attempt needs
fresh verification before retry. Popup cancellation before the OAuth callback
does not reach the hook and leaves the proof usable until expiry. Unlink proof
consumption, continuity checks, and external identity deletion share one
transaction. The locked `auth_step_up_proofs` and `auth_step_up_attempts`
collections keep proof replay and password throttling consistent across app
instances.

PocketBase 0.40.1 returns `validation_collection_system_rule_change` when an
administrator tries to set `_externalAuths.deleteRule` to `null`. The hook's
`onRecordDeleteRequest` guard is therefore required for direct owner API
deletes.

## Stats Route Hooks

Keep `pb_hooks/stats.pb.js` self-contained. Future stats hook splits may move
complete `routerAdd` blocks by vertical, such as diamond routes and coloring
routes, but route callbacks must not depend on top-level helper functions or
shared callback utilities.

### Bulk Count Endpoints

Three bulk count endpoints aggregate record relationships server-side so list
views avoid N+1 per-item queries:

- `GET /api/stats/company-project-counts`: project counts by company.
- `GET /api/stats/tag-project-counts`: project counts by diamond tag.
- `GET /api/stats/coloring-tag-book-counts`: coloring book counts by coloring tag.

All three require authentication, derive the user from `e.auth`, and return
`{ counts: Record<string, number> }`. Tags or companies with zero associations
are omitted; clients default missing keys to zero.

See [`../stats-spec.md`](../stats-spec.md) for the full contract.

## Latest Notes Hook

`pb_hooks/latest_notes.pb.js` provides `POST /api/notes/latest`, which returns
the most recent progress note for each of a batch of project or coloring page
targets. The craft parameter (`"diamond"` or `"coloring"`) selects the table set.
Max 100 IDs per request. The response is `{ items: [...] }` with one row per
target that has a note.

The client wrapper is `src/services/pocketbase/base/latestNotes.ts`, which
batches at 100 IDs with concurrency 2 and returns `null` on 404 for backwards
compatibility.

See [`../stats-spec.md`](../stats-spec.md) for the full contract.

## Coloring Main-Photo Endpoint

`pb_hooks/coloring.pb.js` provides `POST /api/coloring/pages/{pageId}/main-photo`,
which reorders the `photos` file field so a chosen filename becomes the first
entry. The first photo is treated as the cover thumbnail in list views.

The endpoint runs in a transaction: it verifies the authenticated user owns the
book, confirms the filename is still in the photo list (returns 409 if it was
removed concurrently), and reorders only when the photo is not already first.
The client method is `ColoringService.setMainPagePhoto(pageId, filename)`.

## Color Reference Transaction Route

`pb_hooks/color_references.pb.js` provides
`POST /api/coloring/pages/{pageId}/color-reference`, a single transactional
endpoint for all color reference mutations. The route requires authentication,
derives ownership from the page's book, and runs inside `e.app.runInTransaction`.

The `action` field selects the mutation:

- `photos`: append uploaded files. Requires at least one file and a client-generated
  `requestId` (alphanumeric, max 80 chars). Duplicate request IDs are idempotent.
- `notes`: save plain-text notes with a baseline comparison. Returns 409 if the
  stored notes differ from the submitted `baselineNotes`.
- `remove`: remove one photo by `filename`. Pruning a sheet that came from a restore
  batch also prunes the corresponding restore receipt.
- `restore`: append one archived sheet per call with a `restoreKey` and sequential
  `restoreOffset`. Notes are applied only on offset 0 and only when the baseline
  matches. Receipts encode offset and filename so retries short-circuit correctly
  even after a removed-and-readded sheet.

Empty content (no photos, no non-whitespace notes) deletes the record rather than
saving an empty row. The body limit is 200 MB. The unique page index
(`idx_color_reference_page`) prevents duplicate references.

Page reduction checks in `coloring.pb.js` protect pages that have swatch photos
or meaningful color notes, including not-started pages.

See [`../color-codes-and-swatches.md`](../color-codes-and-swatches.md) for the
full feature contract.

## Ownership Integrity Hooks

`relation_ownership.pb.js` keeps direct `user` ownership immutable and validates
changed parent and taxonomy relations before authenticated updates continue. It
covers projects, notes, coloring books and pages, taxonomy joins, randomizer
spins, and user-owned settings. Create rules validate the corresponding
same-owner relationships. The existing coloring-medium ownership hook covers
the page's multi-relation. The update hook is still required because PocketBase
rules evaluate stored relations rather than newly submitted relation values.

The hook does not rewrite existing relations. Audit any pre-existing
cross-owner rows before deployment and repair them only through a reviewed data
change.

## Coloring Page Generation

`coloring.pb.js` accepts page counts from 1 through 500 for new books. Create
requests and increases above 500 fail before `e.next()`, so neither the parent
book nor generated page children are written. Invalid negative, fractional,
and non-finite values also fail at this boundary.

Existing books above 500 are grandfathered. An update may keep or reduce the
stored count, but generated-page reconciliation is skipped while the count
remains above 500. Reductions reject before saving if any excluded page has a
non-default status, lifecycle or reveal data, mediums, photos, or a progress-note
record. The field error identifies the highest worked page so the client can
offer a valid total. Direct record updates may delete at most 500 untouched
pages per request. Their request hook wraps the parent update and child cleanup
in one transaction, so a failed child delete rolls back the full reduction.

Larger reductions use authenticated
`POST /api/coloring/books/{bookId}/reduce-pages` requests with a
`targetTotalPages` integer. Each transaction validates all pages above the final
target, deletes at most 500 highest untouched pages, and lowers `total_pages` to
the matching intermediate boundary. Callers repeat the same final target until
the response reports `done: true`. Interrupted calls leave the stored total and
remaining page rows aligned. The cleanup context skips per-page completion
rollups; the parent update performs one rollup for the batch. Normal clients
cannot supply either trusted context value.

Legacy archives with more than 500 pages use the authenticated archive restore
route. That route supplies the trusted `organized_glitter_archive_restore`
request context and creates at most 100 missing pages per call. The book hooks
persist the parent record for that internal context, then return without page
generation, cleanup, or metrics work. Normal record API clients cannot supply
this context value. Coloring-page creates and updates with the same context also
preserve archived lifecycle dates and skip parent metric writes, so a restore
does not synthesize metadata or trigger a metric query per page.

`account_deletion_integrity.pb.js` replaces client-supplied deletion identity
fields with the authenticated user ID and email before the audit record is
created. It also normalizes the reported sign-in method to the supported
allow-list.

`taxonomy_deletion_guard.pb.js` rejects authenticated deletion of companies,
artists, diamond tags, coloring tags, book publishers, book illustrators, and
coloring mediums while another record still references the item. Clients should
surface the `400` response and ask the user to remove those references first.
Superusers may bypass the guard for reviewed repair work.

## Local Hook Testing

Local hook testing uses the persistent local database in `local-pb-db/pb_data`.
Do not create a temporary PocketBase database for normal hook validation.
PocketBase starts with `local-pb-db/` as the working directory, so it loads hooks
from `local-pb-db/pb_hooks/`, not the repo-root `pb_hooks/` directory.

For local hook testing:

```bash
pnpm pb:local
```

`pnpm pb:local` syncs repo-root `pb_hooks/*.js` into
`local-pb-db/pb_hooks/` before starting the existing local database. Use `--dev`
when diagnosing hooks:

```bash
pnpm pb:local -- --dev
```

`--dev` prints SQL and server-side hook errors to the terminal. The client
response may only say:

```json
{ "data": {}, "message": "Something went wrong while processing your request.", "status": 400 }
```

After editing repo-root hooks while PocketBase is already running, copy the
changed hook into `local-pb-db/pb_hooks/` and let the local server restart:

```bash
cp pb_hooks/stats.pb.js local-pb-db/pb_hooks/stats.pb.js
```

Avoid symlinking `local-pb-db/pb_hooks` back to repo-root `pb_hooks/`. On macOS
the PocketBase hook watcher can restart repeatedly through that symlink.

## Production Hook Uploads

Upload only the hook files needed for the current change:

```bash
scp -P 22 pb_hooks/stats.pb.js USER@HOST:hooks/
```

Then restart PocketBase from the host UI and verify the real endpoints.

Do not leave temporary diagnostic hooks in production. If a temporary endpoint is
unavoidable, make it authenticated, remove it immediately after diagnosis, and
restart PocketBase again.

If a hook upload causes `502` responses, remove the last uploaded hook file from
`hooks/` over SFTP and restart PocketBase.

## Apple Shared Modules

The native readiness and exchange callbacks load `native_apple.js` through
PocketBase's `require` inside each callback. The module loads `apple_config.js` and checks the provider,
credentials, grant collection, encryption, and both rate rules on every request.
It holds no request state and defines the expected native bundle ID once.

Deploy the shared `.js` modules alongside the `.pb.js` hooks. Local startup,
bootstrap, and browser QA copy both kinds of file. A missing module leaves
native readiness false and the exchange unavailable.

### Apple grant operations

This section is the operational reference for native and web Apple grants.
The [auth ADR](../adr/0007-auth-providers-and-token-model.md#apple-grant-custody-and-deletion-gate)
records the design decision; the [API contract](../API_CONTRACT.md#auth-endpoints)
defines client requests and response reasons.

`apple_grant_store.js` owns grant lookup and upsert for native and web Apple
sign-in. Both paths save the identity and grant atomically. A new identity or
link requires a captured refresh token. A response without a new refresh token
requires an existing active grant. If Apple issues a new token, encryption and
storage must succeed even when an older grant exists. A failed grant write
rolls back the identity and returns no auth token.

The sign-in gate checks grants in pages of 100 and fetches their provider links
in batches. It rejects an identity with more than 500 stored grants with
`apple_grant_check_limit` so sign-in work stays bounded.

`apple_revocation.js`
marks grants pending in the same transaction as account deletion, guarded
unlink, and admin unlink. Deletion stops if queueing fails. When PocketBase
removes an unverified Apple link while repairing that account through another
provider, the worker queues its now-orphaned grant as it sweeps active grants.
It checks at most 100 active grants and their links in one transaction per pass
and resumes from a runtime cursor. If a save fails, it retries that page one
grant at a time. Failed grant IDs remain in a runtime FIFO between passes, and
each pass retries up to 100 without stopping the cursor from advancing. The
FIFO holds one ID per distinct unresolved failure, so its storage and parsing
cost scale with the backlog. Restarting PocketBase
clears this runtime state and restarts the complete active-grant sweep.
An orphaned grant cannot be claimed by a new sign-in in the meantime.
A worker processes up to ten oldest pending grants every five minutes, calls
Apple's token revocation endpoint outside the database transaction, and removes
encrypted tokens only after Apple's 200 response. Network, signing, key, and
database failures leave grants queued for another attempt. Sign-in is blocked
for the identity while any of its client grants are pending.

Before enabling strict capture in an existing environment, run
`node scripts/audit-apple-grants.mjs <path-to-data.db> --client-id <native-client-id>`
against a protected database snapshot. The audit reads the web Apple client ID
from the users collection and accepts each native client ID through a repeated
`--client-id` option. It reports only counts of missing active grants by client
ID, orphaned grants, and pending grants. `linksWithoutGrant` counts missing
identity and client ID pairs, so it can exceed `appleLinks`. A missing historical refresh token needs a new Apple authorization;
the worker cannot synthesize one. Keep the private signing and encryption keys
available until all queued grants are resolved.

The native Apple regression runner copies the production route unchanged. Its
fixture module delegates real configuration and provider initialization to
`native_apple.js`, then substitutes token and identity results. A local OAuth
server exercises real exchange errors. The web fixture calls
`apple_web_grant.js` with a disposable provider and encryption key. SQLite
triggers inject grant-write failures, and settings APIs adjust test rate limits;
no test rewrites production source text. Setup and fixtures live under
`scripts/test-support/apple/`, and migration rollback checks cover both initial
global rate-limit states. Each successful run writes `result.json` in its
printed fixture directory. These tests do not verify Apple's live signed tokens.

## Private Apple Configuration

`apple_config.js` reads the owner-only `apple-auth-private/config.json` file
inside the PocketBase data directory for both native and web grant capture.
It rejects symlinks, permissions that allow group or other access, oversized
files, invalid JSON, and malformed credentials. Native availability also tests
signing and encryption. Diagnostics contain fixed reason codes, never values.

`apple_config_backup.pb.js` excludes the whole private directory from backup
creation and preserves the current directory during restore. Deploy this hook
before placing any real credentials in the data directory. See
[setup and recovery](apple-auth-configuration.md).

The native runtime test also creates and restores a real PocketBase backup,
checks that it excludes the private directory, and verifies that the key and
readiness survive restore. Apple provider claims remain a fixture.
