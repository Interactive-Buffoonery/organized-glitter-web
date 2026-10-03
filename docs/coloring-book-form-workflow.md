# Coloring book form workflow

Status: Current as of 2026-09-05.

This document covers the add and edit workflow for coloring books, from route
entry through form validation and PocketBase persistence. It is intended for
developers changing coloring book fields, validation, or save behavior.

## Entry points

- New coloring book: `/projects/new?craft=coloring`
  - `src/pages/NewProjectRouter.tsx` selects `NewColoringBook` when the
    `craft` query param is `coloring`.
  - `/coloring/new` is a legacy redirect to `/projects/new?craft=coloring`.
- Edit coloring book from detail: `/coloring/:id`
  - The detail page opens `src/components/coloring/ColoringBookEditDrawer.tsx`
    instead of navigating away.
  - The drawer reuses `ColoringBookForm` without its built-in footer and
    submits through the drawer footer's form id.
- Direct edit fallback: `/coloring/:id/edit`
  - `src/pages/EditColoringBook.tsx` still loads the existing book and passes it
    as `initialBook` for deep links and direct route fallback.
- Detail and page routes are separate surfaces:
  - `/coloring/:id`
  - `/coloring/:bookId/pages/:pageId`

Coloring routes are protected and gated by `useEnabledVerticals`; users with
`coloring_books` disabled are redirected back to dashboard or the diamond
project flow.

## Data flow

1. Page components fetch taxonomy options:
   - publishers via `useBookPublishers`
   - illustrators via `useBookIllustrators`
2. `ColoringBookForm` owns local form state, field errors, cover preview state,
   crop dialog state, and the immediate submit lock.
3. `validateColoringBookForm` validates local form values before any page-level
   save handler runs.
4. The create page and `useSaveColoringBookEdit` map camelCase form values to
   PocketBase field names:
   - `totalPages` to `total_pages`
   - `sourceUrl` to `source_url`
   - `publicationYear` to `publication_year`
   - `bookFormat` to `book_format`
   - `coverImage` to `cover_image`
5. React Query mutations call `ColoringService.createBookWithTags` or
   `ColoringService.updateBookWithTags`.
6. `ColoringService` writes `coloring_books`, then syncs tag relations through
   `ColoringTagService.syncBookTags`.

If tag sync fails after the book saves, the mutation result includes
`tagSyncError`. The app shows a warning but keeps the saved book; the drawer
closes in place and the direct edit route navigates to detail.

## Form state contract

`ColoringBookFormValues` is the UI state shape. It intentionally differs from
the PocketBase payload shape so the form can represent in-progress edits.

Important constraints:

- Required fields:
  - `title`
  - `totalPages`
  - `status`
- Normal creation and increases require `totalPages` to be an integer from `1`
  through `500`. The limit matches the largest page set the detail route loads
  and bounds synchronous generated-page work.
- Existing books above 500 pages are grandfathered. They can keep their stored
  total unchanged. They can decrease only when every page above the requested
  total is untouched; if any excluded page contains work, the update is
  rejected and the book and its pages remain unchanged. Legacy books cannot
  increase while their total remains above 500.
- A direct record update can reduce a book by at most 500 pages. Larger
  reductions use the authenticated reduction route, which deletes at most 500
  untouched pages per atomic request and lowers `total_pages` to the resulting
  valid intermediate total. The client repeats those requests until it reaches
  the requested total. Cleanup does not synthesize status or lifecycle dates.
- The `Number of pages` input is controlled and must preserve an empty string
  while the user clears and replaces its value.
  - Do not convert `''` to `Number('')`.
  - `Number('')` is `0`, which causes the field to render `0` during replacement
    and can produce values such as `050`.
  - Use the existing pattern:

```tsx
onChange={event =>
  setField('totalPages', event.target.value === '' ? '' : Number(event.target.value))
}
```

- Optional numeric inputs use the same empty-string pattern when users can clear
  the field. `publicationYear` maps an empty value to `undefined` on create and
  PocketBase's `0` number default on edit so saved values can be cleared.
- Create handlers generally omit optional empty values by passing `undefined`.
- Edit handlers generally send empty strings or `null` where clearing an
  existing PocketBase value is the desired behavior.

## Save behavior

New coloring books:

- `NewColoringBook` trims text fields before save.
- Empty optional fields are omitted from the create payload.
- `useCreateColoringBook` caches the saved detail record, invalidates coloring
  book queries, and captures `coloring_book_created`.
- The page also invalidates coloring book, coloring page, book detail, and
  coloring tag stat queries after save.

Edited coloring books:

- `ColoringBookEditDrawer` and `EditColoringBook` both save through
  `useSaveColoringBookEdit`, which sends a full patch for the editable fields.
- The drawer closes in place after a successful save. The direct edit route
  navigates back to `/coloring/:id` after a successful save.
- The drawer footer exposes Archive and Delete as icon actions. Archive updates
  the book status to `archived`; Delete removes the book and its generated page
  records through the existing delete mutation.
- Empty optional relations are sent as `''`; `ColoringService.updateBook`
  translates them to the PocketBase relation-clear sentinel.
- Total-page changes rely on the server to recalculate completion metrics.
  Direct updates to `completed_pages` without a total-page change recalculate
  `completion_percentage` in `ColoringService.updateBook`.
- Reductions inspect every page above the requested total for status, lifecycle
  or reveal values, mediums, photos, and progress-note
  records. A worked page rejects the reduction instead of being deleted or
  hidden.
- Page status changes rely on PocketBase coloring hooks to update
  `coloring_books.completed_pages` and
  `coloring_books.completion_percentage`.
- Client detail views read persisted book metrics instead of deriving
  completion from the loaded page list.
- The detail route fetches at most 500 page records per request. Legacy books
  above that count expose Next and Previous controls so every stored page
  remains reachable from the book.
- Most book updates refresh `last_activity_at`; explicit
  `last_activity_at`-only updates do not.
- `useUpdateColoringBook` updates and invalidates the detail query, invalidates
  coloring book lists, and captures update analytics.

## Validation and accessibility

- Validation lives in `src/schemas/coloring/coloringBook.schema.ts`.
- Archive manifest validation requires safe page counts. Legacy archives above
  500 pages also require complete page coverage before the importer uses the
  bounded archive restore route. The route has no arbitrary legacy page maximum
  and restores at most 100 generated pages per request.
- Field errors are returned as `ColoringBookFormFieldErrors` and rendered by
  `FieldError`. Each newly rendered error uses `role="alert"` so full-page forms
  announce custom validation failures even though their footer action is a
  `type="button"` control.
- Error IDs come from `getColoringBookErrorId`, and fields with errors set
  `aria-invalid` plus `aria-describedby`.
- Submit is guarded by both parent pending state and an immediate local submit
  lock so double clicks cannot send duplicate requests before React Query
  reports pending state.

## Tests to update

Use the narrowest test seam for the behavior being changed.

- Form state, validation, and submit payloads:
  - `src/components/coloring/__tests__/ColoringBookForm.test.tsx`
  - Example regression: replacing the default page count should display `50`,
    not `050`, and submit `{ totalPages: 50 }`.
- New page payload mapping and post-save behavior:
  - `src/pages/__tests__/NewColoringBook.test.tsx`
- Edit page payload mapping and clearing behavior:
  - `src/pages/__tests__/EditColoringBook.test.tsx`
- Detail drawer behavior:
  - `src/components/coloring/__tests__/ColoringBookEditDrawer.test.tsx`
  - `src/pages/__tests__/ColoringBookDetail.test.tsx`
- Service relation and metric behavior:
  - `src/services/pocketbase/__tests__/coloring.service.relations.test.ts`

Useful focused commands:

```bash
pnpm test -- src/components/coloring/__tests__/ColoringBookForm.test.tsx
pnpm test -- src/pages/__tests__/NewColoringBook.test.tsx src/pages/__tests__/EditColoringBook.test.tsx
pnpm test -- src/services/pocketbase/__tests__/coloring.service.relations.test.ts
```

## Field-change checklist

When adding or changing a coloring book field:

1. Update `ColoringBookFormValues` validation in
   `src/schemas/coloring/coloringBook.schema.ts`.
2. Add or update the field component under `src/components/coloring/`.
3. Confirm the page handler maps the UI field to the correct PocketBase field
   name for both create and edit.
4. Decide how empty values behave on create and edit.
5. If the field can be cleared in a controlled input, keep the empty edit state
   representable in the form.
6. Add a focused test at the form, page, or service seam that owns the behavior.
