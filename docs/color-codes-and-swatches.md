# Color Codes & Swatches

Coloring page detail includes Color Codes & Swatches below Mediums in the existing
control panel. Page photos, the main image, Progress, status, dates, and mystery
controls retain their existing behavior.

A reference can contain multiple full-sheet photos, one plain-text note, or both.
Add photo opens a preview dialog with Choose photos and Take photo. Compatible
phones provide camera capture; desktop browsers can offer a file picker instead.
Save photos does not require text. Edit note opens an inline Save/Cancel editor.
Removing a sheet leaves other sheets and notes intact. Clearing the final content
removes the reference and returns to the empty state.

## Images and notes

The shared format and 50 MB per-file policies apply. JPG, PNG, WebP, and GIF files
must decode before upload and retain their original bytes and resolution. The
browser honors their orientation metadata. HEIC/HEIF files are accepted only if
the browser can decode them, then converted at full dimensions to JPEG. An
unreadable file reports how to export it as JPG or PNG. No cover crop is applied.
The collection permits up to 100 sheets. The UI limits each upload to 190 MB,
leaving multipart overhead within the 200 MB request limit. Selections that exceed the remaining photo count are rejected before decoding. Preparation stops when converted files would exceed the batch byte limit.

The panel requests 320px fit thumbnails lazily, with asynchronous decoding. The viewer uses protected originals,
zoom buttons, and a focusable scroll region for keyboard and touch panning.
File tokens refresh while the page is mounted and has photos. Notes-only references do not request file tokens. Temporary preview URLs are revoked
on removal, cancellation, successful save, and page/account navigation.

Notes are not Markdown and are never parsed as codes or numbers. Spaces, leading
zeros, punctuation, and line breaks remain visible. PocketBase normalizes line
endings to CRLF. The editor disables autocorrection, capitalization, and spelling
changes. The maximum note length is 100,000 characters.

## Storage and safety

`coloring_page_color_references` has required `page` and `user` relations, multiple
`photos`, optional `notes`, and normal IDs/timestamps. A unique page index permits
only one reference per page. Empty references are removed by the mutation route.
Whitespace-only notes with no sheets do not count as saved work.

List/view rules require the authenticated owner and ownership of the page's book.
Regular create/update/delete APIs are locked. The app-owned transaction route
`POST /api/coloring/pages/{pageId}/color-reference` validates the page and book
owner on every write and derives relations from that identity. References cannot
be reassigned. Both originals and thumbnails are protected by PocketBase file
tokens and the view rule; unauthenticated and other-account requests are denied.
The web viewer keeps stable file references and adds the current account's file
token when loading each image.
Page, book, and user cascade deletion removes the reference and stored files.

The transaction reads the current reference before appending or removing files.
Concurrent first saves converge through this transaction and the unique index.
An upload batch either saves entirely or leaves every selected file retryable.
Hidden `upload_receipts` retains the most recent 200 upload request IDs, so a lost
response can be retried without duplicating sheets. An unconfirmed upload keeps
its submitted files and request ID fixed: Choose, Take photo, and selection removal
stay disabled until the exact batch succeeds or the user cancels. Exact retries
can reach the server receipt check even if a refresh already shows 100 photos.
Cancel refreshes the reference to show any files the server committed.
A definitive client-error response allows selection changes only if no earlier
response for that batch was uncertain.

Notes use an exact baseline comparison and report a conflict if another editor
saved first. A notes conflict refreshes the saved reference without discarding
the draft, so Cancel and reopen loads the current baseline.

Service access lives in `src/services/pocketbase/colorReferences.service.ts`.
Query/mutation hooks use account-and-page keys. The focused section remounts on
page/account changes, discarding drafts, and captures the original save target.
Successful writes update cache immediately; refresh failure does not turn them
into failed uploads. These mutations do not emit progress-note analytics or
update page/book completion metrics.

Both page-count reduction checks in `pb_hooks/coloring.pb.js` protect pages with
swatch photos or meaningful color notes, including not-started pages.

## Archives

New exports use archive schema version 2; version 1 remains importable. Swatches
have their own file role and page-owned manifest reference. Export preserves
notes and original files, without copying them into page or progress photos.
Export and import share a 512MB ZIP ceiling. Photos that would push the archive
over that ceiling are omitted with a warning so the backup stays restorable.
Protected swatch downloads refresh the short-lived file token during long
exports and retry authorization failures.

Restore submits one sheet per transaction. Hidden `restore_key` and receipt
ordinals make batches resumable. A continuation cannot recreate a deleted
reference. A different existing reference returns a conflict instead of being
overwritten. Retrying completed batches preserves later user edits and deletions.
Missing swatch files report an incomplete restore rather than silently dropping
sheets. A swatch failure is reported with its page and book, while progress entries
and later pages continue restoring. The book recovery checkpoint remains available
for retry. Notes-only restore does not require a photo part.
Existing archive book identity, metadata checkpoints, and concurrency
protections remain in effect.

Each restore receipt records the offset's exact filename, so a retry only
short-circuits when that photo is still present. Removing a sheet that a
restore batch already added prunes its receipt; a later retry with the same
`restoreKey` re-uploads that sheet instead of silently doing nothing, while
other completed offsets in the same batch are untouched. Before a sheet is removed, valid bare legacy receipts are associated with their
filenames using the pre-removal photo order. Deleting an early sheet therefore
does not shift the meaning of later receipts. Archived notes are applied only
when the reference is first created, so photo retries preserve later note edits,
including an intentional clear.

Successful mutation responses include `reference` and `addedPhotoCount`. A
receipt retry contributes zero. The archive importer uses only that added count
in the photo summary, including additions already committed if a later photo in
the same restore fails. Archive restore carries the reference ID and actual
additions through the adapter into `refMap` and the import summary.

Deploy the updated `pb_hooks/color_references.pb.js` before releasing this client.
The response extension is compatible with existing clients; the updated archive
client requires the count and retains recovery state if an older hook omits it.
No schema migration is required for these recovery and bookkeeping fixes.

## Local validation

- `node scripts/test-color-references.mjs`: starts its own disposable PocketBase,
  verifies ownership/files, concurrent writes, retry behavior, page reduction,
  archive batches, and lifecycle cleanup. It leaves fixture directories under
  `.tmp` and stops its own server.
- `pnpm test:pr`: supported full repository gate.
- `e2e/authenticated/color-references.spec.ts`: actual app upload, retry, notes,
  viewer, keyboard, light/dark appearance, removal, and isolation from page data.

Physical iPhone camera/photo-library permissions, software keyboard behavior,
and finger-driven panning still require a device walkthrough. Desktop emulation
and automated iPhone WebKit runs do not certify those OS interactions.

The feature-specific browser suite passed eight cases across Chromium and iPhone
WebKit. Both engines displayed an EXIF-rotated JPEG correctly. WebKit decoded and
saved the HEIC/HEIF fixtures; Chromium rejected them with conversion guidance.
The viewer passed the automated accessibility scan and mobile 44px control checks.
The review-fix browser run verified a committed upload with its response dropped,
then retried the same receipt without adding duplicate photos in both engines.
That targeted local run bypassed CSP because the production image policy excludes
local PocketBase origins. The production browser smoke gate kept CSP enabled.
The disposable backend suite passed 20 checks, including notes-only archive
restore without a photo part and safe retry, and restore-receipt recovery
after a mid-restore photo removal.

React Doctor advisories about sequential image decoding and the keyboard-focusable
scroll region are intentional: decoding one full-resolution image at a time limits
peak memory, and the region supports arrow-key panning. The editor focus effect
runs after its textarea mounts. The focused section owns the draft and upload
lifecycle so page/account remounts discard both together.

The original feature passed the full `pnpm test:pr` gate. Review-fix validation
includes focused archive/hook tests, disposable backend checks, and the full gate.
The recurring started-date timeout came from navigation cleanup deleting valid
query entries based on their labels. That heuristic was removed; regression tests
preserve valid entries and retain cleanup for confirmed 404 responses. The date
save browser flow passed ten consecutive runs without retries. See
`docs/testing-playwright.md` for the failure mechanism.
React Doctor reported 88/100 with advisories reviewed above. Its hydration warning
points to UUID generation inside a click handler, not rendered output.
