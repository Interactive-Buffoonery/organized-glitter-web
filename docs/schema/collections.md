# PocketBase Collection Schema Contract

Status: current as of 2026-07-27. Source snapshot:
`docs/pocketbase/collections.schema.json`.

All collections have PocketBase system fields unless noted: `id`, `collectionId`,
`collectionName`, `created`, and `updated`. Auth collections also include auth
system behavior for email/password, token handling, verification, and external
auth records.

The native SwiftUI repository uses hand-written `Codable` DTOs for the fields
required by shipped features. This schema remains the server source of truth;
the native application copies no TypeScript source, migrations, or hooks.

## Rule Summary

Current business collections are user-scoped either directly with
`user = @request.auth.id` or through parent relations such as
`project.user = @request.auth.id` and `book.user = @request.auth.id`. See
`docs/RULE_AUDIT.md` for operation-by-operation rules.

## Protected Legacy File Fields

The target schema marks these legacy fields `protected: true`. Production keeps
its current unprotected state until the six-field migration is deployed after
compatible clients. Color-reference photos are already protected.

| Collection                     | Field         | Max files                | Notes               |
| ------------------------------ | ------------- | ------------------------ | ------------------- |
| `users`                        | `avatar`      | 1                        | Profile image       |
| `projects`                     | `image`       | 1                        | Project image       |
| `progress_notes`               | `image`       | 1                        | Progress note image |
| `coloring_books`               | `cover_image` | 1                        | Book cover          |
| `coloring_pages`               | `photos`      | 99                       | Page photos         |
| `coloring_page_progress_notes` | `image`       | unrestricted by snapshot | Progress note image |

## JSON Fields

| Field                                                 | Shape contract                                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `randomizer_spins.selected_projects`                  | Required JSON array of selected project snapshots used by spin history. Mobile must preserve unknown keys.                           |
| `randomizer_spins.metadata`                           | Optional JSON object for spin context. Server-side validation is a follow-up.                                                        |
| `user_dashboard_settings.navigation_context`          | Optional JSON object for diamond-painting dashboard navigation state. Clients should tolerate missing or partial values.             |
| `user_dashboard_settings.vertical_enabled`            | JSON object with `diamond_painting` and `coloring_books` booleans. Hook rejects both false and fills default when missing on create. |
| `user_dashboard_settings.coloring_navigation_context` | Optional JSON object for coloring dashboard navigation state. Clients should tolerate missing or partial values.                     |
| `user_dashboard_settings.randomizer_next_up`          | Optional JSON object for randomizer next-up state. Clients should tolerate missing or partial values.                                |
| `user_yearly_stats.status_breakdown`                  | JSON object keyed by project status with numeric counts.                                                                             |
| `account_deletions.usage_snapshot`                    | JSON object capturing account usage at deletion request time. Admin/read-only reporting data.                                        |

## Collections

### `archive_restore_items` (base)

Private server-written receipts make multipart archive restore idempotent across
parts, devices, retries, and cleared browser storage. Each row records the user,
backup and item identities, item kind and digest, `scaffold` or `complete`
state, and the allowlisted target collection, record, field, and stored file
name. `descriptor_digest` keeps the immutable parent descriptor distinct from
the final item digest when a covered parent arrives after a child. For gallery
assets, `asset_position` preserves archive order across independent parts. The
unique identity is `(user, backup_id, item_id)`.

Users may list and view only their own receipts. Client create, update, and
delete are locked. The archive restore hook owns every write. The `user`
relation cascades on account deletion; receipts contain no asset bytes.
The migration can roll back while this collection is empty. Once any receipt
exists, rollback stops and leaves the additive collection in place so an
application rollback can still retry existing archives safely. Delete only
disposable test users through their normal account cascade.

### `users` (auth)

Required fields: `email`, `username`, `password`, `tokenKey`.

Non-system fields: `avatar` protected file, `beta_tester` bool, `timezone` text,
`theme_preference` select (`system`, `light`, `dark`, `catppuccin-latte`,
`catppuccin-frappe`, `catppuccin-macchiato`, `catppuccin-mocha`),
`coloring_walkthrough_seen` bool.

The app offers only `system`, `light`, and `dark`. Dark renders Berry Cream
after dark. The Catppuccin values remain accepted by the current collection
schema for existing records: Latte resolves to Light, while Frappé, Macchiato,
and Mocha resolve to Dark. New preference writes use only the three current
values.

Auth rule: only verified records can authenticate. The current verified user
can list/view/update/delete self. Create remains public for registration.

Every non-admin business collection rule also requires
`@request.auth.verified = true` before applying its owner or parent relation
checks. Existing records linked through `_externalAuths` were marked verified
when this policy was introduced so OAuth-only account access remains intact.

Mobile notes: use auth APIs rather than direct writes for password, OAuth, token
refresh, and account lifecycle.

### `_superusers` (auth)

Admin-only system collection. No mobile model.

### `apple_oauth_grants` (base)

Server-only encrypted Apple refresh grants. Each row holds the user ID without
a cascading relation, a hashed provider identity, Apple client ID, AES-256-GCM
ciphertext, key version, and active or pending-revocation state. All client
list, view, create, update, and delete rules are locked. The user ID has no
cascading relation so pending grants can outlive their user. Rollback refuses
to remove a collection with stored grants. See
[Apple grant operations](../pocketbase/hooks.md#apple-grant-operations) for
custody, deletion, retries, and key retention, and
[private configuration](../pocketbase/apple-auth-configuration.md) for key storage.

### `account_deletions` (base)

Required fields: `user_id`, `user_email`, `signup_method`.

Optional fields: `notes`, `usage_snapshot` JSON.

Rules: authenticated create; list/view/update/delete admin-only.

The create hook replaces `user_id` and `user_email` with the authenticated
record values and normalizes `signup_method` to the supported allow-list.
Clients must not expect to read these records back.

### `projects` (base)

Required fields: `title`, `user`, `status`, `kit_category`.

Selects:

- `status`: `wishlist`, `purchased`, `stash`, `progress`, `completed`,
  `archived`, `destashed`, `onhold`, `kitted`
- `kit_category`: `full`, `mini`
- `drill_shape`: `round`, `square`

Relations: `user` cascades on user delete; optional `company`; optional `artist`.

Files: `image` protected, max 1.

Rules: user-owned CRUD. Create rules require optional company and artist
relations to share the owner. The update request hook enforces the submitted
relation values because PocketBase update rules evaluate stored relations.

Mobile notes: PocketBase select enforcement is the status enum boundary.
`date_completed` is user-entered only; sort proxy fields are maintained server-side.

### `progress_notes` (base)

Required fields: `project`, `date`.

Fields: `content` editor, `image` protected file max 1.

Relations: `project` cascades on project delete.

Rules: CRUD allowed when `project.user = @request.auth.id`. The update hook
validates any newly submitted project relation.

Mobile notes: relation-scoped ownership means clients should create notes only
after loading the parent project owned by the current user.

### `project_tags` (base)

Required fields: `project`, `tag`.

Relations: `project` cascades on project delete; `tag` does not cascade.

Rules: list/view/update/delete through `project.user`; create also requires
`tag.user = @request.auth.id`.

The update request hook validates changed project and tag relations against the
authenticated owner.

### `tags`, `artists`, `companies` (base)

Required fields:

- `tags`: `name`, `slug`, `color`, `user`
- `artists`: `name`, `user`
- `companies`: `name`, `user`

Relations: `user` cascades on user delete.

Rules: user-owned CRUD. The `user` owner is immutable.

Mobile notes: use these as user-owned taxonomy collections. `companies.website_url`
is a URL field.

### `coloring_books` (base)

Required fields: `user`, `title`, `status`, `total_pages`.

`total_pages` supports integers from 1 through 500 for normal creation and
increases. The coloring lifecycle hook rejects unsupported counts before saving
the book or generating child pages. Existing books above 500 can keep their
stored total unchanged. A reduction succeeds only when every page above the
requested total is untouched; if an excluded page contains work, the update is
rejected and the transaction preserves the book and all of its pages. The
exported number field keeps its static maximum unset because a schema-level
maximum would also reject unchanged historical records.

A direct record update can reduce `total_pages` by at most 500. Larger
reductions use the authenticated batch route. Each request atomically removes at
most 500 untouched excess pages and lowers `total_pages` to that valid
intermediate count. A page counts as worked when it has a non-default status,
lifecycle or reveal values, mediums, photos, or progress-note
records. Cleanup does not synthesize status or lifecycle dates.

Archive restore accepts legacy books above 500 when the archive contains
complete unique page coverage. It has no arbitrary legacy page maximum and
creates at most 100 generated pages per authenticated restore request.

Selects:

- `status`: `wishlist`, `purchased`, `in_stash`, `in_progress`, `completed`,
  `archived`, `destashed`
- `book_format`: `paperback`, `hardcover`, `pdf`, `printable_pages`, `magazine`,
  `other`
- `language`: `english`, `spanish`, `french`, `german`, `japanese`, `other`,
  `unknown`

Relations: `user` cascades; optional `publisher`; optional `illustrator`.

Files: `cover_image` protected, max 1.

Rules: user-owned CRUD. Publisher and illustrator relations must share the book
owner on create, and the update request hook validates changed relations. The
`user` owner is immutable.

Mobile notes: validate the 500-page limit before normal saves. Preserve an
unchanged legacy total above 500, and reject a reduction that would exclude a
worked page. Hooks create missing generated pages and maintain completion
metrics. Clients should refresh the book after save.

### `coloring_pages` (base)

Required fields: `book`, `page_number`, `status`.

Selects: `status` is `not_started`, `palette_chosen`, `in_progress`,
`on_hold`, `completed`.

Relations: `book` cascades on book delete; optional multi-relation `mediums`.

Files: `photos` protected, max 99.

Rules: CRUD allowed when `book.user = @request.auth.id`. Update hooks validate
any newly submitted book relation and each newly added medium owner.

Mobile notes: hooks maintain `started_at`, `completed_at`, and parent book
rollups. Page status writes should refresh the parent book after success.

### `coloring_page_progress_notes` (base)

Required fields: `user`, `page`, `date`.

Fields: `content` text, `image` protected file.

Relations: `user` cascades; `page` cascades.

Rules: CRUD allowed when `user = @request.auth.id && page.book.user = @request.auth.id`.
The `user` owner is immutable, and the update hook validates any newly
submitted page relation.

The legacy PocketBase export reports `user.maxSelect: 0`; PocketBase 0.37.5
stores this required relation as one scalar record ID, matching generated types.

Mobile notes: preserve the double ownership check when building repositories.

### Coloring taxonomy collections (base)

Collections: `book_publishers`, `book_illustrators`, `coloring_mediums`,
`coloring_tags`, `coloring_book_tags`.

Required fields:

- `book_publishers`: `user`, `name`
- `book_illustrators`: `user`, `name`
- `coloring_mediums`: `user`, `name`, `type`
- `coloring_tags`: `user`, `name`, `slug`, `color`
- `coloring_book_tags`: `book`, `tag`

Selects: `coloring_mediums.type` is `colored_pencil`, `alcohol_marker`,
`water_based_marker`, `gel_pen`, `watercolor`, `pastel`, `other`,
`acrylic_paint_pen`.

Rules: user-owned CRUD, except `coloring_book_tags` is scoped through
`book.user = @request.auth.id`; both create rules and update hooks also require
the tag to share that owner.

Mobile notes: confirm expand paths for book-tag reads before using realtime.

Referenced user-editable taxonomy records cannot be deleted. Request hooks
provide the validation response, and atomic SQLite triggers prevent a reference
from being added between that check and the delete.

### `randomizer_spins` (base)

Required fields: `user`, `project_title`, `spun_at`, `selected_projects`.

Relations: `user` cascades; optional `project`.

JSON: `selected_projects` required, `metadata` optional.

Rules: user-owned list/view/create/update/delete. An optional project relation
must share that owner, and the owner cannot be reassigned.

Mobile notes: `selected_count`, selected project eligibility, and metadata shape
are not fully server-validated yet. Treat this as a follow-up before mobile
allows spin editing.

### `user_dashboard_settings` (base)

Required fields: `user`.

JSON fields: `navigation_context`, `vertical_enabled`,
`coloring_navigation_context`, `randomizer_next_up`.

Relations: `user` cascades.

Rules: user-owned CRUD.

Mobile notes: `vertical_enabled` is hook-validated. Other JSON fields should be
read with defaults and written with schema-compatible objects.

### `user_dashboard_stats` (base)

Required fields: `user`.

Fields: status counts, total project count, and `last_updated`.

Rules: user-owned list/view; create/update/delete admin-only.

Mobile notes: read-only aggregate. Prefer stats routes unless a repository has a
specific reason to read this collection directly.

### `user_yearly_stats` (base)

Required fields: `user`, `year`, `stats_type`, `last_calculated`.

Selects: `stats_type` is `yearly`.

JSON: `status_breakdown`.

Rules: user-owned CRUD.

Mobile notes: client writes are allowed today but should be reviewed before
mobile relies on them. Prefer server-generated stats where possible.

### PocketBase internal collections

Collections: `_authOrigins`, `_externalAuths`, `_mfas`, `_otps`.

Rules: readable by the owning auth record where applicable; writes are
admin-only except owner deletion for auth origins and external auths.

Mobile notes: use PocketBase auth APIs. Do not build direct repositories for
these collections.

### `coloring_page_color_references` (base)

Required owner `user` and page `page` relations both cascade on parent deletion.
The unique `idx_color_reference_page` index enforces one record per page. Optional
plain-text `notes` permits 100,000 characters. `photos` permits 100 JPEG, PNG, WebP,
or GIF files, each up to 50 MB, with `320x320f` thumbnails. This new file field is
**protected**, including originals and thumbnails; the older file-field policy
above does not apply to it.

Read rules require both direct ownership and ownership of `page.book`. Normal
create/update/delete rules are locked; the authenticated transactional route
validates and derives immutable relations. Empty content removes the record.
Hidden `restore_key` and JSON `upload_receipts` are internal retry state, not
user-authored content. See [Color Codes & Swatches](../color-codes-and-swatches.md).
