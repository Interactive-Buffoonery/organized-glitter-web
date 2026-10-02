# Data import and export

Status: current

Organized Glitter supports CSV import/export, Diamond Art Club CSV import, guided bulk photo import, and full archive ZIP backup and restore from `Settings > Data`.

The legacy `/import` route remains protected and redirects to `Settings > Data` at `/profile?tab=data`.

## Settings layout

The `Settings > Data` panel is ordered by task:

1. Import
   - Organized Glitter CSV
   - Diamond Art Club CSV
   - Photos
2. Restore archive
3. Export

Archive backup is the recommended first step before large imports or restore work. The full archive ZIP is the most complete export format because it includes CSV data plus supported project, coloring, progress note, tag, status, medium, and photo fields.

## Export options

`Settings > Data` exposes four export actions:

- `Diamond projects CSV`: downloads diamond project spreadsheet data only.
- `Coloring books CSV`: downloads coloring book spreadsheet data only.
- `Coloring pages CSV`: downloads coloring page spreadsheet data with book metadata, medium names, photo counts, and progress note counts.
- `Export full archive`: downloads the archive ZIP format with CSV data plus supported photo fields for diamond projects, progress notes, coloring books, and coloring pages.

CSV exports exclude photos and progress note images. No photo-only export format exists.

## Organized Glitter CSV

Use the standard CSV format for diamond project text fields and tags. The `Import project data` section in `Settings > Data` lets users download the Organized Glitter CSV template, fill in one diamond project per row, then import the completed file.

CSV import is diamond-project only. It does not import progress notes or photos.
Photos can be attached later with the `Import photos` section, including project covers and progress note images.

## Diamond Art Club CSV

Diamond Art Club order CSV files have their own section in `Settings > Data`. Log into your Diamond
Art Club account, open
[your Orders page](https://www.diamondartclub.com/pages/orders?view=orders-page), then click
`Export All` to download the CSV.

The CSV must include:

- `Products`
- `Date`

Each product becomes one diamond project with:

- `company`: `Diamond Art Club`
- `status`: `purchased`
- `datePurchased`: the parsed order date
- `title`: the product text

When a DAC row contains multiple products, Organized Glitter splits the `Products` value with `/,(?!\s)/`. Invalid dates are reported in the preview. DAC CSV files do not include photo files, so photos must be attached later through normal editing, guided bulk photo import, or archive restore.

Duplicate handling:

- Same-file duplicates are detected with normalized `title + company + datePurchased`.
- Current-library duplicates use the same key and are skipped during import.
- Duplicates are not created by default; the import result reports them as skipped.
- The same title with a different purchase date remains importable.

## Guided Bulk Photo Import

Bulk photo import is a review-first workflow for attaching many existing photos after records already exist.

Supported targets:

- Diamond project cover image
- Diamond project progress note image
- Coloring book cover image
- Coloring page gallery photo
- Coloring page progress note image

Inputs:

- ZIP file containing images
- Folder picker where the browser supports it
- Optional `photo-import.csv` or `photo-import.json` manifest

For ZIP input, the compressed file limit is 512 MiB. The importer checks ZIP
entry counts, declared sizes, non-manifest compression ratios, and total expanded
size before loading entries. Photo manifests are exempt from the compression
ratio limit but remain capped at 64 MiB each. It then bounds actual extraction
to 50 MiB per image and 2 GiB across the ZIP. Folder input retains its existing
per-image upload validation.

The JSON manifest accepts an array of file entries or an object with a `files`
array. Each entry requires a nonempty string `path`. Optional `targetType` and
`targetRef` must use the supported values below. Optional `title` and `note`
must be strings, and a nonempty `date` must be a valid `YYYY-MM-DD` calendar
date. Invalid entries identify their row and field before photo matching starts.
Unknown JSON fields are ignored. An invalid `pageNumber` is ignored, as in CSV
manifests. CSV also accepts `filename` or `file` for `path` and `id` for
`targetRef`, and trims cell values.
Malformed CSV rows are rejected before photo matching starts.
Manifest paths must be unique after trimming, case folding, and treating `\\`
and `/` as the same separator. Duplicate paths identify both entries and stop
matching, so conflicting target instructions cannot silently choose one.

Manifest `targetRef` values use `project:<id>`, `coloring-book:<id>`, or
`coloring-page:<id>`. A project reference supports `project-cover` and
`project-progress-note`; a coloring book supports `coloring-book-cover`; a
coloring page supports `coloring-page-photo` and `coloring-page-progress-note`.
When `targetType` is omitted, the default is the cover for a project or book and
the gallery photo for a page. Title-only manifest matches currently resolve
diamond projects and support the two project target types.

If an explicit reference or title cannot be resolved, or its target type is
incompatible, the photo appears as an unmatched, skipped row with a reason. It
does not fall through to filename matching. Choose a valid target type and record
in the review step to include it.
For a cover target with no existing image, selected photos are tried in order.
After one uploads successfully, later photos for that target are skipped unless
overwrite is enabled.

Matching order:

1. Manifest match
2. Exact record ID or ref in filename or folder
3. Exact title match from folder name
4. Coloring page number from filename or folder path
5. Filename token match against title
6. Unmatched

Unmatched files are skipped by default. Existing project and coloring book covers are also skipped by default. The review table lets the user change target type, choose a different target record, include or exclude a row, and explicitly allow cover overwrites.

Coloring page gallery photos append until the page reaches the PocketBase 99-photo field limit. Any photo beyond that limit is skipped and reported.

Progress photos create new progress note records. If a manifest supplies a date, that date is used. Otherwise, the file `lastModified` date is used. The default note body is `Imported photo`.

## Archive ZIP Export

Archive export creates a ZIP named:

```text
organized-glitter-export-YYYY-MM-DD.zip
```

The archive includes:

- `manifest.json`
- `diamond-projects.csv`
- `coloring-books.csv`
- `coloring-pages.csv`
- Diamond projects, tags, cover photos, and progress notes
- Coloring mediums, coloring books, tags, cover photos, generated coloring pages, page photos, page status, page medium references, and page progress notes

Photo files are stored under:

```text
photos/projects/<project-id>/cover.<ext>
photos/projects/<project-id>/progress-notes/<note-id>.<ext>
photos/coloring-books/<book-id>/cover.<ext>
photos/coloring-books/<book-id>/pages/<page-number>/<index>.<ext>
photos/coloring-books/<book-id>/pages/<page-number>/progress-notes/<note-id>.<ext>
```

Archive v1 stores coloring mediums as portable records in `manifest.json`, then stores coloring page medium selections as `coloring-medium:<old-id>` refs. Restore maps those refs to mediums in the current account by name, creating a missing medium when needed.

Protected PocketBase photos are fetched with a private file token. Archive export
refreshes that token during long downloads and retries authorization failures, so
later swatches are not silently dropped when the original two-minute token expires.
The token is only used for the download request and is not written into the ZIP. If
the token cannot be requested, export fails instead of creating an archive that
looks complete but is missing photos.

The archive does not include auth tokens, passwords, email, profile data, or private account metadata. If an individual photo cannot be fetched after token retrieval succeeds, the archive still downloads and records a warning in `manifest.json`.

Diamond project metadata includes color count.
Export reads the source records again after building the ZIP. If a project,
book, page, medium, reference, or progress note changed during export, the
download fails and asks you to retry after edits stop. This is a best-effort
check across separate PocketBase reads, not a database transaction: an edit
after the final read cannot be detected.

Export and import share a 512MB compressed ZIP ceiling, independent of the 50MB
per-image upload cap. Export includes every photo it can fetch, then checks the
final ZIP size. If the completed ZIP exceeds the ceiling, export fails without
downloading a partial archive. Legacy export also rejects any CSV or photo entry
above the 64 MiB restore limit. Import rejects larger files before reading entries.
Restore checks the raw ZIP central directory before JSZip loads its entries,
then checks parsed entry metadata before expanding files. Both stages use the
same per-entry size and compression-ratio rules and separately account for total
expanded bytes. Manifest entries skip the ratio check but still count toward
entry-size and total-size limits. Each ZIP or v3 part
supports at most 10,000 entries, a 16 MiB central directory, 64 MiB per
expanded entry, and 2 GiB of total expanded data. A non-manifest entry may
expand by at most 1,000 times its compressed size. The manifest limit is 64 MiB.
Legacy manifests support at most 10,000 files, diamond projects, coloring
mediums, coloring books, and warnings per array, 100,000 coloring pages in
total, and 10,000 nested note, photo, tag, and medium references combined. A
coloring page supports at most 99 photos. V3 manifests support at most 10,000
items and warnings per part, with server-sized metadata lists. The v3 packer
rejects excess warnings without dropping them and rejects metadata lists above
the restore limit. It rejects assets above 64 MiB and splits items to fit the
remaining per-part limits, including the 16 MiB central-directory limit.
Older archives above these limits must be split into smaller parts before
restore. ZIP64 and multi-disk archives are unsupported.

### Multipart archive v3 format

The v3 format and packer are implemented as internal building blocks. The restore
screen accepts v3 parts when the server advertises multipart restore capability.
The export screen continues to use the legacy format until multipart export is enabled.

A v3 backup is a set of numbered ZIP files. Each part contains `manifest.json`
and may be restored independently. The default target is 128 MiB and the hard
limit is 512 MiB per ZIP. Callers may provide smaller limits for tests. Files use
ZIP STORE mode so the packer can calculate the exact byte count before any part
is offered for download. The packer also splits before a part's manifest exceeds
the 64 MiB restore limit or its central directory exceeds 16 MiB. It rejects an
item whose required dependencies cannot fit.

The export measures every asset with incremental SHA-256 and CRC32 in a first
streaming pass. This freezes item digests, asset lengths, the part count, and the
complete partition plan. A second pass builds one part at a time and rejects any
asset whose length, digest, or CRC32 changed. The packer does not retain every
archive part in memory.

Every part includes its restore dependencies. A part with a coloring page or a
page child repeats all coloring-medium definitions referenced by that page. A
part with a swatch photo also repeats its color-reference definition. Repeated
items keep the same item ID and digest, appear at most once per part, and count
toward that part's exact size. This lets a later numbered part restore without
an earlier part or browser recovery state.

Manifests use recursively key-sorted canonical JSON. Item and inventory digests
cover the strict kind-specific metadata, recursive parent descriptors, and asset
descriptors. Validation rejects unsafe paths, missing or undeclared files,
duplicate identities, incorrect digests or lengths, malformed part identities,
and missing dependency definitions.

A parent descriptor digest uses the same item envelope as a full item with
`assets: []`: `{ kind, itemId, parent?, metadata, assets: [] }`. The serialized
parent descriptor omits `assets`, so browser and server implementations must add
the empty array only when calculating or checking its digest.

## Archive ZIP Import

Archive import only accepts archives created by Organized Glitter.

### Multipart v3 restore

Choose one v3 ZIP part to restore its records independently, or select several
parts from the same backup to restore them together. Later parts can be restored
without earlier parts. The result lists selected and missing part numbers; a
successful subset does not mean the full backup was restored. Keep every ZIP
until all desired parts have completed.

The importer checks server capability and size limits, then validates every
selected manifest, declared file, byte length, and SHA-256 digest before the
first server write. It expands one ZIP part at a time. A malformed selected part
stops the whole selection before any records are created. ZIP entry paths and
expanded manifest and asset sizes are bounded before processing. Account change
or cancellation stops further requests. The server requires a verified user and
uses per-item receipts to make retries idempotent across browser sessions.

A valid item can still conflict with existing account data. Those conflicts are
reported per item while independent items continue. The summary counts only
confirmed created, prepared parent, already applied, and asset responses.
Cancellation or a lost response can leave a write unconfirmed; retry the same
part to learn its final outcome. Cache refresh is best effort after confirmed
writes and cannot turn them into restore failures. An old server can still
restore legacy v1/v2 ZIPs; a v3 restore requires the v3 capability response.
Network and authorization errors stop the restore rather than suggesting that
the server is outdated.

### Legacy v1/v2 restore

Behavior:

- Validates `manifest.json` before creating records.
- Rejects unsupported schema versions.
- Rejects absolute paths and `..` paths.
- Imports into the current authenticated account only.
- Creates new records in the current account when no matching parent exists.
- Matches existing parent records and continues restoring missing child records so a retry after a partial failure can complete progress notes, coloring page state, and page progress notes.
- Keeps diamond projects from the same archive distinct even when they share a title and source URL. Recovery checkpoints preserve each archive ref's destination across retries, while existing account records are matched at most once per restore. Missing or ambiguous recovery targets are reported instead of merging records.
- Does not overwrite existing parent records.
- Maps old archive refs to new PocketBase IDs during import.
- Maps coloring medium refs to current-account medium IDs by name.
- Reports missing optional photo files as warnings.
- Creates new coloring books with an archive-specific ID and restores generated pages in batches of at most 100. A retry resumes the same book instead of creating a duplicate.
- Keeps a checkpointed archive book as the retry target even if another book later matches its title, publisher, and illustrator. If a previously confirmed archive book was deleted, restore reports a recoverable conflict instead of recreating it or merging archived children into the other book. A create request that never returned remains retryable because the checkpoint has not yet confirmed whether the archive book exists.
- Restores coloring page metadata only when the page still matches the saved generated-page baseline. If the archived metadata already matches, the page is complete. If the current page changed, restore preserves it and reports a conflict and an incomplete result.
- Recomputes only the coloring book's completed page count and completion percentage from the final stored page statuses after archive page work. This includes pages preserved because of conflicts and does not restore independently edited book status, dates, notes, or other metadata.
- Keeps the original coloring book cover when a create response is lost and the create request is replayed.

Coloring page recovery checkpoints are stored per account and archive fingerprint in browser storage, with each page stored separately so large restores do not repeatedly rewrite the full checkpoint. Existing whole-archive checkpoints remain readable. Checkpoints contain record IDs and coloring page metadata, not archive photos or progress note content. If browser storage is unavailable, recovery continues for the current page session from memory. Closing that page, clearing site data, or retrying in another browser can remove the checkpoint. Without a trustworthy checkpoint, restore does not overwrite differing page metadata.

Diamond project recovery checkpoints use the same account and archive fingerprint boundary. Completed checkpoints expire after 30 days; checkpoints with unfinished tag work are retained until that work succeeds. They preserve each archive project ref's destination record ID and incomplete tag work across retries. If that checkpoint is unavailable and more than one existing project matches the same title and source URL, restore reports the ambiguity instead of choosing a record and merging children into it.

This recovery state supports retrying an archive restore in the same browser. It is not offline archive storage. Keep the original ZIP until the restore summary reports success.

Archive restores for the same account are serialized in the browser so overlapping restores cannot create the same records at the same time.

Coloring books with more than 500 pages remain restorable when the archive manifest contains exactly one entry for every page number from 1 through the declared total. The normal coloring book create and edit limits still apply. The archive restore routes and the coloring lifecycle hook must be deployed together because the routes use the trusted `organized_glitter_archive_restore` hook context for bounded page creation and exact archived dates.

Duplicate defaults:

- Diamond projects are matched when an existing project has the same `title + sourceUrl`.
- Coloring books are matched when an existing book has the same `title + publisher + illustrator`.
- Progress notes under matched parents are skipped when an existing note has the same `date + content + image presence`.
- No fuzzy matching is performed in this branch.

The restore summary reports created diamond projects, created coloring books, created progress notes, imported photos, matched existing records, skipped records, warnings, and errors.

## Shopify Research

Shopify is research-only for this import/export cleanup.

Findings:

- Shopify merchant order CSV export exists, but it is not a reliable customer-facing import path.
- Shopify Admin API access requires a store/admin context and credentials.
- Shopify Customer Account API is not a simple paste-my-orders path for Organized Glitter.
- Direct Shopify integration should stay out of the first cleanup.

Pasting a public Shopify **product** URL to prefill a private diamond project
is a separate proposed flow. See
[`plans/url-kit-import.md`](./plans/url-kit-import.md). That plan is not order
import and is not a shared catalog crawl.

References:

- <https://help.shopify.com/en/manual/orders/manage-orders/exporting-orders>
- <https://shopify.dev/docs/api/customer/latest>
- <https://shopify.dev/docs/apps/launch/protected-customer-data>

## Future Web Import Assistant

Future helper forms could include:

- Desktop bookmarklet
- iOS Apple Shortcut using Run JavaScript on Web Page
- Browser extension using active-tab style permissions

The user would open Shopify, DAC, Etsy, or another order/history page, run the helper, and receive normalized JSON or CSV for Organized Glitter import.

Constraints:

- Bookmarklets may be blocked by Content Security Policy.
- Helpers can only read rendered browser content.
- Image extraction is unreliable because images may be authenticated or CORS-protected.
- Each source site needs a parser adapter.
- Helpers must never collect credentials or hidden private data.

References:

- <https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/javascript>
- <https://developer.chrome.com/docs/extensions/develop/concepts/activeTab>
- <https://support.apple.com/en-euro/guide/shortcuts/apd218e2187d/ios>

## Color reference archive extension

Archive exports now use schema version 2. Version 1 remains importable; older
application versions reject version 2 rather than silently losing color references.
Each coloring page can contain `colorReference` with a portable reference, exact
plain-text `notes`, and `photoPaths`. Swatch files use `coloring-swatch-photo` and
`photos/coloring-books/<book-id>/pages/<page-number>/swatches/<index>.<ext>`.

Restore sends swatches through the color-reference service, separate from page
photos and progress entries. Per-photo transactions and archive receipt ordinals
support retry after partial failures without replacing existing references or
recreating a deleted continuation target. See [Color Codes & Swatches](./color-codes-and-swatches.md).

### Swatch restore accounting

The swatch mutation response includes the restored reference and the number of
photos added by that transaction. Receipt retries contribute zero additions.
The importer records the new swatch reference ID in `refMap` and includes only
actual additions from successful reference restores in the photo summary.
If a later photo transaction fails, additions already committed by earlier
transactions stay in that summary so a retry can continue from receipts.
Deploy the updated color-reference hook before the client; older hook responses
without this metadata are reported as incomplete and keep import recovery state.
