# PocketBase API Contract

Status: mobile backend readiness contract, updated 2026-07-27.

## Environments

Clients should receive the PocketBase base URL from environment-specific config.
Local development uses `VITE_POCKETBASE_URL=http://localhost:8090` for the PWA.
Mobile clients should use their own environment config rather than reading Vite
variables directly.

## Auth Endpoints

Mobile and PWA clients rely on PocketBase `users` auth APIs:

- Email/password auth
- OAuth2 auth for Apple, Google, and Discord
- `listAuthMethods`
- `authRefresh`
- Logout by clearing the local token
- Password reset and account lifecycle flows as supported by the current web auth service

Provider discovery reads `oauth2.providers` from `listAuthMethods` and accepts
the legacy `authProviders` array only as a fallback. Clients expose only Apple,
Google, and Discord. Production returned Google and Discord on 2026-09-20;
Apple remains a deployment configuration blocker.

Authenticated linking uses the standard OAuth2 endpoint with the current user
token and a fresh, single-use proof. The proof lasts five minutes and is bound
to the user, action, and target provider. A server hook consumes it before the
link attempt, keeps the completed provider identity on that same user, and
returns 409 when the identity belongs to another account or would otherwise be
attached by email alone. A failed server-side link attempt requires fresh
verification before retrying.

`POST /api/auth/step-up/password` accepts
`{ "action": "link" | "unlink", "targetProvider": "...", "proof": "...", "password": "..." }`.
It requires a verified `users` token, validates the current password against a
fresh user record, and stores only the proof hash. Failed password checks are
limited to five per user in a ten-minute window. Returns 204 on success, 400 for
an invalid password or body, 403 for an unverified user, and 429 when limited.
OAuth-only users can create the same proof by reauthenticating with an exact
already-linked provider identity. Email equality never creates a proof.

`DELETE /api/auth/external-auths/{provider}` unlinks Apple, Google, or Discord.
It requires a verified `users` token and `{ "proof": "..." }`. The server
consumes the proof, checks current provider continuity, and deletes the identity
in one transaction. Password proof can remove the last configured social
provider. OAuth proof requires another configured linked provider to remain.
Returns 204 on success, 400 for an unsupported provider, 403 for an unverified
user or invalid proof, 404 when the provider is not linked, and 409 when current
provider configuration would remove the last proven sign-in method. Direct
owner deletes from `_externalAuths` are rejected by the request hook because
PocketBase 0.40.1 does not allow changing system collection API rules.

Password reset uses the shared web and native link, request, error, and deployment
contract in [`mobile/password-reset-links.md`](./mobile/password-reset-links.md).

See `docs/adr/0007-auth-providers-and-token-model.md` for provider and token expectations.

Native Sign in with Apple uses `GET /api/auth/apple/native/readiness`, which
returns only `{ "available": boolean }`. If false or unavailable, iOS does not
offer the native Apple action and still offers email access. Guest-only
`POST /api/auth/apple/native` accepts a JSON object with a nonempty Apple
authorization `code`, the raw per-attempt `nonce`, and optional
`name: { givenName?, familyName? }`. It returns PocketBase's standard
`{ token, record, meta }` auth response. It rejects other request fields and
has a 4096-byte body limit. Invalid grants and claims return 400, including a
missing verified email on first signup; an existing email without the exact
Apple link returns 409. Authenticated calls and unverifiable existing links
return 403, rate-limited calls 429, and provider or configuration outages return 503. Readiness requests are also rate limited. Never retry a consumed code; start
a fresh Apple authorization. A lost response may mean the account committed, so
the fresh attempt resolves the existing identity.

The backend reads `apple-auth-private/config.json` inside its PocketBase data
directory. It contains `teamId`, `keyId`, `privateKey`, and the separate
32-character ASCII `grantEncryptionKey`. The directory must have owner-only
permissions (0700) and the file owner-only permissions (0600). Native client ID
is a fixed server constant. No custom environment variables are required.
See [private Apple configuration](pocketbase/apple-auth-configuration.md) for
setup, backup exclusion, and recovery requirements.
The users collection's Apple OAuth provider must also remain enabled for web
and native Apple availability. The native client ID is the iOS App ID, separate
from the web Services ID. A new web Apple link requires durable grant storage.
Grant-related 503 responses
include a stable `data.reason.code` such as `apple_grant_required` or
`apple_grant_revocation_pending`. Identities with more than 500 stored grants
receive `apple_grant_check_limit` and must be repaired before Apple sign-in.
If Apple supplies a new refresh token, sign-in fails with
`apple_grant_prepare_failed` unless the server can encrypt it, even when an
older grant is active.

See [Apple grant operations](pocketbase/hooks.md#apple-grant-operations) for
existing-link recovery, revocation, rollout audits, worker limits, and key
retention.

Password authentication requires a verified user record. OAuth authentication
continues to verify the linked user during the provider transaction. Protected
collection APIs and custom application routes require
`@request.auth.verified = true` in addition to their ownership checks. When the
verification auth rule is first deployed, the migration rotates the users
collection auth-token secret. Every existing user token is revoked and clients
must authenticate again.

For password login, PocketBase returns HTTP 403 with
`The request doesn't satisfy the collection requirements to authenticate.`
when the `users` auth rule rejects the account. Because that rule is
`verified = true`, the web client offers email-verification recovery for this
response. Other forbidden responses keep their normal error handling.

## Collection REST Conventions

Use standard PocketBase collection endpoints:

- List: `GET /api/collections/{collection}/records`
- Get: `GET /api/collections/{collection}/records/{id}`
- Create: `POST /api/collections/{collection}/records`
- Update: `PATCH /api/collections/{collection}/records/{id}`
- Delete: `DELETE /api/collections/{collection}/records/{id}`

Collection rules determine visibility and write access. Mobile repositories
should treat 403/404 on another user's record as an access failure, not as cache
corruption.

## Pagination and Filters

- Use PocketBase `page` and `perPage` for paginated lists.
- Use `skipTotal` when total counts are not needed.
- Use PocketBase filter syntax and parameterized filters where the SDK supports it.
- Preserve current service behavior that search terms shorter than 2 characters
  should not reach service filters.

## Cross-client Project Filters

`ProjectFilters` is the cross-client service contract described in `CONTEXT.md`.
The web `FilterState` is UI state, not a mobile API contract. Mobile should
build its own adapter from native state to `ProjectFilters`.

## File URLs

Current file fields are unprotected. Anyone who knows a constructed file URL can
retrieve it without the parent record rule authorizing the file request. A
protected-file policy and cross-user proof are required before native launch.
See `docs/FILE_ACCESS_CONTRACT.md` for the compatibility blocker.

## Stats Routes

Stats routes are exposed through `pb_hooks/stats.pb.js` under `/api/stats/*` and
require authentication. Mobile repositories should use the documented service
error taxonomy and should not assume stats data is realtime.

`GET /api/stats/company-project-counts` returns a `counts` object keyed by
company record ID. It aggregates the authenticated user's projects in one
database query and omits companies with no projects.
`GET /api/stats/artist-project-counts` returns the same shape keyed by artist
record ID.

`GET /api/stats/tag-project-counts` and
`GET /api/stats/coloring-tag-book-counts` return the same shape for diamond
project tags and coloring book tags. They omit tags with no relationships.

## Notes Routes

`POST /api/notes/latest` accepts `{ craft, userId, targetIds }` and returns the
most recent progress note per target. `craft` is `"diamond"` or `"coloring"`.
Max 100 IDs per request. The server validates that `userId` matches the
authenticated user. Response is `{ items: [{ id, targetId, date, created }] }`.
Targets with no notes are omitted.

See `docs/stats-spec.md` for the full contract and SQL sketch.

## Coloring Routes

`POST /api/coloring/pages/{pageId}/main-photo` reorders a coloring page's
`photos` field so the provided `filename` becomes the first entry. Returns 400
if `filename` is empty, 403 if the page is not owned by the user, and 409 if the
photo is no longer in the list. Returns the updated page record on success.

### Color Reference Route

`POST /api/coloring/pages/{pageId}/color-reference` is a transactional endpoint
for managing swatch photos and notes on a coloring page. It requires
authentication and validates that the user owns the page's book. The `action`
field selects the mutation: `photos` (append uploaded files), `notes` (save
plain-text notes with baseline conflict detection), `remove` (delete one photo
by filename), or `restore` (sequential archive restore with resumable receipts).

Returns `{ reference, addedPhotoCount }` on success. `reference` is the updated
record, or `null` when empty content removes it. `addedPhotoCount` is present on
`restore` responses and counts the photos committed by that transaction; receipt
retries contribute zero. The client validates that `addedPhotoCount` is a safe
non-negative integer bounded by the file count before accepting the result.
Returns 400 for invalid actions or missing files, 403 when the page is not owned
by the user, and 409 for note conflicts, restore sequence errors, or existing
references during restore. The body limit is 200 MB.

Normal create/update/delete APIs on the `coloring_page_color_references`
collection are locked. All mutations go through this route. File tokens are
required for both originals and thumbnails.

See [`docs/color-codes-and-swatches.md`](./color-codes-and-swatches.md) for the
full feature contract.

## Error Taxonomy

Align mobile repositories with `src/services/CONTRACTS.md`:

| Raw condition                      | Repository category        |
| ---------------------------------- | -------------------------- |
| 400 validation field errors        | Validation error           |
| 401 invalid or missing token       | Auth error                 |
| 403 forbidden rule result          | Access denied              |
| 404 missing or inaccessible record | Not found or access denied |
| Network timeout/offline            | Network error              |
| 409 conflict or auth continuity    | Conflict error             |
| 5xx PocketBase failure             | Server error               |

## Refresh After Save

Launch clients should refresh records after successful writes. This keeps PWA and
mobile behavior compatible without requiring realtime or custom conflict merging.
