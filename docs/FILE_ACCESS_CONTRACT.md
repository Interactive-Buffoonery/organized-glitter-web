# File Access Contract

Status: the committed target schema protects the six legacy file fields below.
Production remains unprotected until these migrations are deployed.

## Privacy Blocker

The six legacy file fields below are still unprotected in production.
Color-reference swatch photos are already protected. Clients can construct
legacy file URLs directly from:

- PocketBase base URL
- collection name or collection ID
- record ID
- filename
- optional `thumb` query parameter

An unprotected PocketBase file remains retrievable by anyone who knows its URL.
Parent collection record rules do not authorize that subsequent file request.
This does not meet the private-library expectation and is a native
public-release blocker.

## Fields in the Protection Migration

| Collection                     | Field         |
| ------------------------------ | ------------- |
| `users`                        | `avatar`      |
| `projects`                     | `image`       |
| `progress_notes`               | `image`       |
| `coloring_books`               | `cover_image` |
| `coloring_pages`               | `photos`      |
| `coloring_page_progress_notes` | `image`       |

## Security Note

Protecting these fields requires a compatibility plan for the PWA, native
client, cached URLs, thumbnails, and uploads. Release the token-capable web
client before activating the schema migration in production. No iOS app has
been released yet, so native compatibility is a gate for the first iOS release,
not for this production migration.

PocketBase protected files use a short-lived file token. The committed users
collection sets its lifetime to 180 seconds. The web client requests a token while an account
is active and renews it before expiry. Image components add the current token
to stable file URLs when they render, including URLs stored in React Query
results. It withholds PocketBase file URLs until a token exists. Archive export
uses its own token session and retries a protected-file 404 once because
PocketBase can return 404 for an expired token.
Private project and note images remain viewable in the gallery dialog; their
new-tab link is hidden so a file token does not enter browser history.

Web support does not itself change file privacy. Before the schema migration,
old tokenless file URLs still work even when the web app uses file tokens.
Release the token-capable web client before deploying the six
dashboard-generated migrations. Release the recovery-capable web build before
PR 292's seventh migration rotates the users file-token signing secret.
Previously issued file tokens fail immediately while login tokens stay valid.
The current web client requests one fresh token after a failed private image
request and retries that image once. Older open tabs keep their previous code
until they reload; let users save forms before a reload. PocketBase checks each
protected-file request against the record's collection View rule; rotation adds
revocation and does not replace that ownership check. Verify live collection View rules, cache
headers, CDN behavior, and any direct backing-storage paths before the
production change. The migration rollbacks refuse to unprotect files; a
rollback needs a reviewed forward migration or backup recovery.

Check the rotation transition with an active session during rollout.

## Validation

- Each unprotected file URL currently resolves when the URL is known.
- A cross-user test must prove the chosen protected-file policy before launch.
- A token-expiry test must keep already-visible images and newly requested
  thumbnails available without exposing a tokenless URL.
- Test each field's original and thumbnail with an owner token, another user
  token, no token, expired token, and an auth header without a file token.
- Test uploads, replacement, deletion, long archive export, tab resume, and
  account switching after the schema change.
- iOS uploads document HEIC/HEIF conversion or accepted format behavior before
  launch.

The repeatable local upgrade test starts with two verified fake accounts and
existing file bytes in all six fields plus protected color-reference photos.
After the six migrations, originals and thumbnails return 200 with the owner's
previously issued file token and 404 with another account's token, no token, or
a malformed token. The optional seventh migration makes the old file token
return 404 while a fresh owner token returns 200 and the old login token still
refreshes. A genuinely expired signed file token also returns 404. The test
checks that filenames and bytes survive. Run it with
`pnpm pb:test:protected-file-upgrade`; see [the deployment order](pocketbase/README.md)
for the combined command. Production cache, CDN, backing-storage, and
cross-account checks remain deployment gates. Native device checks remain a
gate for the first iOS release.
