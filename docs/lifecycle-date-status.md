# Completion dates and status

Saving a nonempty completion date marks a diamond project, coloring book, or
coloring page Completed. This applies on create and when the date changes on an
existing record. An Archived or Destashed project or book keeps that status when
its completion date is added or corrected.

Changing status does not create, replace, or clear a date. Clearing a completion
date leaves status unchanged. An unrelated edit to a record with a historical
completion date does not change its manually selected status.
Entering the same saved completion date again in an edit form also keeps that status.

The project and coloring-book web forms use one status-transition hook to show
the change as soon as the date is entered and restore a prior status when the
date is reverted or cleared. PocketBase hooks enforce the saved-record rule
for other clients and imports. Archive restore
preserves the status and dates in the archive. Coloring-page completion updates
the parent book's completed-page count.

Inline project date saves send only the changed date. PocketBase sets Completed
from the current record when the date is saved, so a concurrent archive or
destash is preserved.

Legacy archive project restore uses an authenticated PocketBase route with a
restore context, so a saved completion date does not replace the archived
status. The route assigns the signed-in user and checks ownership of related
companies and artists.

The local PocketBase smoke test is `node test/local-completion-status.mjs`
after `pnpm pb:bootstrap:local -- --seed` or `pnpm pb:local` is running.
