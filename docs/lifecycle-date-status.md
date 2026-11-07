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

In web forms, a newly entered completion date keeps Status at Completed. A hint
under Status explains that clearing the new date allows another status. This
snap-back does not ask for confirmation.

When a saved Completed project, book, or page has a completion date, choosing
another status in a single-record web control asks for confirmation. The prompt
explains that the date is kept. For projects and pages, it also says the record
still counts as finished, because stats count their dates. Book dates are not
counted, so the book prompt leaves that out. Cancel keeps Completed. Choosing
Archived or Destashed, or clearing the date first in a form, does not show this
prompt.
Dates and date-based stats are unchanged.
