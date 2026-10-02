# Mobile sync v1

The native app uses the same PocketBase account and collections as the web app.
Both routes require a verified `users` session. They are available only after
the receipt migration and hook in this change have been deployed together.

`GET /api/mobile/sync/snapshot` returns one complete, consistent snapshot:

```json
{
  "version": 1,
  "projects": [],
  "coloringBooks": [],
  "coloringPages": [],
  "progressNotes": [],
  "coloringPageProgressNotes": []
}
```

Each array contains owner-scoped PocketBase records with the named collection's
public fields, including record ID, created and updated timestamps, relations,
and file names. Project `expand` includes the owned company, artist, and
`project_tags_via_project` tag names. Book `expand` includes the owned publisher,
illustrator, and `coloring_book_tags_via_book` tag names. Page `expand` includes
the owned book title and medium names. An invalid cross-account relation is
never expanded. The route does not return file bytes. The route
reads the five collections and their related labels in one transaction. It
rejects a library with more than 10,000 source and related records total or a
JSON response over 16 MiB with HTTP 413 and
`reason = "snapshot_too_large"`. The size check counts UTF-8 JSON bytes as
records are added, including array separators and the response wrapper. A client
must reconcile deletions only after receiving a complete HTTP 200 response.
Failed or interrupted snapshots must leave local records unchanged. The snapshot
includes all current web writes at its transaction boundary; later writes
appear on the next refresh.

`POST /api/mobile/sync/apply` edits one existing record. Example:

```json
{
  "operationId": "client-stable-unique-id-0001",
  "collection": "projects",
  "recordId": "abc123abc123abc",
  "base": { "title": "Old title" },
  "patch": { "title": "New title" }
}
```

`base` must include every patched field with the value seen before the local
edit. If a lifecycle field is patched, include the entire lifecycle group in
`base`: `status`, `date_started`, and `date_completed` for projects and books;
`status`, `started_at`, `completed_at`, `revealed_at`, and `revealed_subject`
for pages. Empty values may be sent as `null` in `base`; they match only an
empty stored value. The client must keep one stable operation ID for retries,
using 8 to 100 letters, digits, underscores, or hyphens. Each request is at
most 32 KiB.

The server checks owner and changed fields in one transaction, then applies a
partial update through normal PocketBase save hooks. Changes to other fields
can merge. A changed field or lifecycle group returns HTTP 409 with
`reason = "field_conflict"` and `record` containing the current
record. An operation ID reused with a different payload returns HTTP 409 with
`reason = "operation_id_reused"`. A missing or inaccessible record returns
HTTP 404. A successful response is `{ "outcome": "updated", "record": {...} }`.
Retrying the identical operation returns `outcome: "replayed"` and the current
owned record. A replay checks that the target still exists and belongs to the
signed-in user. The receipt and record save commit in the same transaction.
Receipts keep the owner, stable operation ID, and request hash, never a copy of
user content. The unique owner and operation ID pair identifies retries without
depending on the limited length of PocketBase record IDs. They are server-only and are
removed when their owner account is deleted.

Receipts remain for the lifetime of the account. There is no time-based
pruning because a delayed retry must still be recognized. Each successful
operation adds one small receipt; watch the collection size as use grows and
design an explicit client/server retry window before introducing retention
limits.

Before enabling these routes in production, enable PocketBase's built-in rate
limiter under Dashboard > Settings > Application and append these rules to the
existing rules without replacing them:

```json
[
  {
    "label": "GET /api/mobile/sync/snapshot",
    "audience": "@auth",
    "duration": 60,
    "maxRequests": 6
  },
  { "label": "POST /api/mobile/sync/apply", "audience": "@auth", "duration": 60, "maxRequests": 60 }
]
```

The snapshot is intended for foreground entry and manual refresh, not polling.
PocketBase's global rate-limit middleware applies these method and path rules
when rate limits are enabled. Check the target's existing rules and reverse
proxy behavior before enabling them; settings are not part of the sanitized
collection schema export.

Supported fields:

| Collection       | Fields                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects`       | `title`, `status`, `kit_category`, `drill_shape`, `source_url`, `general_notes`, `date_purchased`, `date_received`, `date_started`, `date_completed`, `width`, `height`, `total_diamonds`, `color_count`, `company`, `artist`                |
| `coloring_books` | `title`, `series`, `theme`, `isbn`, `is_mystery`, `status`, `source_url`, `notes`, `edition`, `date_purchased`, `date_received`, `date_started`, `date_completed`, `publication_year`, `book_format`, `language`, `publisher`, `illustrator` |
| `coloring_pages` | `status`, `revealed_subject`, `revealed_at`, `started_at`, `completed_at`, `mediums`                                                                                                                                                         |

All changed relation IDs must belong to the signed-in user. File uploads,
creation, deletion, book page counts, and progress note edits remain online
operations. The route does not accept ownership or derived metric fields.
It calls PocketBase's internal save inside a transaction, which runs persistence
hooks but does not run record-request hooks. The route therefore repeats the
request-only owner and changed-relation checks. Its allowlist excludes
`total_pages`, so the book request hook's page-count transaction wrapper is
not needed; the existing book and page persistence hooks still update page
dates and book metrics.

Deploy only `pb_migrations/1790500000_created_mobile_sync_receipts.js` for this
change after checking target migration history. Upload only
`pb_hooks/mobile_sync.pb.js` for the hook. Do not upload the whole migrations
directory. The migration refuses rollback once a receipt exists, since removing
receipts would make retries unsafe.

Run `pnpm pb:test:mobile-sync` for the disposable server
test, then `pnpm pb:validate:schema`, `pnpm pb:validate:migrations`, and
`pnpm pb:validate:upgrade -- --base-ref=origin/dev`.
