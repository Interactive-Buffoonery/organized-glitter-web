# PocketBase Services

This directory contains PocketBase integration services that follow consistent patterns for data access, error handling, and type safety.

## Services

### ProjectsService (`projects.service.ts`)

Optimized service for project data operations with structured filtering and performance monitoring.

### ColoringService (`coloring.service.ts`)

CRUD boundary for coloring books and pages. UI forms and React Query mutations
should call this service instead of writing directly to `coloring_books` or
`coloring_pages`.

Coloring book payload rules:

- `title` and `user` are required for creates. `createBook` reads the current
  authenticated user and supplies `user`.
- `is_mystery` is optional in the PocketBase schema, but the service sends
  `false` by default on create. Treat missing values from older records as
  non-mystery at app boundaries.
- `false` is a meaningful value. Do not filter it out with truthiness checks,
  especially when a cover image forces the payload through `FormData`.
- Empty publisher and illustrator values are omitted on create. On update, empty
  strings intentionally clear those optional relation fields.
- `createBookWithTags` and `updateBookWithTags` save the book first, then sync
  `coloring_book_tags`. They return the saved book plus an optional
  `tagSyncError` so callers can show a warning without losing the book change.
- Changes to `total_pages` or `completed_pages` recalculate
  `completion_percentage`.

Coloring page payload rules:

- UI callers should update pages through the action-shaped commands in
  `useUpdateColoringPage`; raw PocketBase field names stay in the
  `src/features/coloring-progress` command module and service boundary.
- `mediums` stores relation ids and maps to `mediumIds` in the DTO.
- Saving a new nonempty `completed_at` sets page status to `completed`. Status
  changes never synthesize or clear lifecycle dates. Clearing a date leaves
  status unchanged.
- After page updates, the service best-effort syncs parent book metrics. A
  metric sync failure is logged and does not fail the page update.

See [`docs/coloring-book-save-workflow.md`](../../../docs/coloring-book-save-workflow.md) for the
UI save flow, duplicate-submit guard, and cache invalidation checklist.

### AccountDeletionService (`accountDeletion.service.ts`)

Account deletion orchestration for the `/delete-account` page.

- Creates an `account_deletions` audit/request record before deleting the user.
- Deletes only the `users` record directly and relies on PocketBase
  `cascadeDelete` relations for user-owned records.
- Captures a best-effort pre-delete usage snapshot. Count failures are recorded
  in the snapshot and do not block the deletion.
- Does not use PocketBase batch operations because the audit/request record must
  survive even if the final user deletion fails.

### Base Services (`base/`)

Shared helpers for error handling, filter construction, batch deletes, and common helper types.

Domain services call `pb.collection()` directly for collection-specific reads and writes. Field
mapping is service-specific: read mappers live in functions such as `toProjectDTO`, `toBookDTO`,
and `toPageDTO`, while write payloads use explicit PocketBase field names at the service boundary.

## Error Handling

All services use consistent error handling via `ErrorHandler`, which provides user-friendly error messages.

## Performance

- Optimized PocketBase queries with structured filters
- Retry logic handles transient network issues
