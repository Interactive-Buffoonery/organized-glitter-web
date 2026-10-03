# Coloring book metadata and taxonomy workflow

Status: active

This document covers the coloring book form metadata path, with extra detail for
publishers and illustrators because those taxonomies can be created inline while a
book is being added or edited.

## Source map

- Form shell: `src/components/coloring/ColoringBookForm.tsx`
- Bibliography fields: `src/components/coloring/ColoringBookBibliographyFields.tsx`
- Inline taxonomy select: `src/components/coloring/ColoringTaxonomySelect.tsx`
- New book page: `src/pages/NewColoringBook.tsx`
- Edit book page: `src/pages/EditColoringBook.tsx`
- Query hooks:
  - `src/hooks/queries/coloring/useBookPublishers.ts`
  - `src/hooks/queries/coloring/useBookIllustrators.ts`
- Mutation hooks:
  - `src/hooks/mutations/coloring/useCreateBookPublisher.ts`
  - `src/hooks/mutations/coloring/useCreateBookIllustrator.ts`
- PocketBase services:
  - `src/services/pocketbase/bookPublishers.service.ts`
  - `src/services/pocketbase/bookIllustrators.service.ts`
  - `src/services/pocketbase/coloring.service.ts`
  - `src/services/pocketbase/coloringBookQueryBuilder.ts`

## Data model

Coloring book publishers and illustrators are separate from the diamond painting
company and artist taxonomies.

| Collection          | Fields used by the app        | Notes                                                                                |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `book_publishers`   | `user`, `name`, `website_url` | `name` is required. `website_url` is optional and used on the profile taxonomy tab.  |
| `book_illustrators` | `user`, `name`                | `name` is required.                                                                  |
| `coloring_books`    | `publisher`, `illustrator`    | Both relations are optional and point to the coloring-specific taxonomy collections. |

PocketBase rules scope all taxonomy rows to the authenticated owner with
`user = @request.auth.id`. The services also require an authenticated user before
creating, updating, or deleting taxonomy rows.

The `coloring_books.status` value `in_stash` remains the stored enum for books
that are owned but not started. The app displays that value as
`On Bookshelf (Not Started)` in coloring-book UI.

## Form flow

1. `NewColoringBook` and `EditColoringBook` load the current user's publisher and
   illustrator lists through `useBookPublishers(user?.id)` and
   `useBookIllustrators(user?.id)`.
2. `ColoringBookForm` normalizes the list results to `{ id, name }` options and
   passes them into `ColoringBookBibliographyFields`.
3. `ColoringBookBibliographyFields` renders one `ColoringTaxonomySelect` for
   publisher and one for illustrator.
4. Selecting "No publisher" or "No illustrator" stores an empty string in form
   state. On create, empty relation fields are omitted. On edit, empty relation
   fields clear the relation.
5. Submitting the form sends relation IDs through `ColoringService.createBook` or
   `ColoringService.updateBook`.

Example create payload shape after the page maps form values:

```ts
{
  title: values.title.trim(),
  total_pages: values.totalPages,
  publisher: values.publisher || undefined,
  illustrator: values.illustrator || undefined,
}
```

Example edit patch shape:

```ts
{
  publisher: values.publisher || '',
  illustrator: values.illustrator || '',
}
```

## Inline taxonomy creation

`ColoringTaxonomySelect` lets the user create a publisher or illustrator without
leaving the book form:

1. The plus button opens a dialog.
2. The dialog trims the entered name and calls `onCreate(name)`.
3. The page-provided callback calls the matching React Query mutation:
   - `useCreateBookPublisher().mutateAsync({ name })`
   - `useCreateBookIllustrator().mutateAsync({ name })`
4. The mutation calls `createIfNotExists` on the service.
5. On success, the mutation invalidates the matching taxonomy query key and
   captures the taxonomy-created analytics event.
6. The select immediately sets the returned ID as the current form value.

The select keeps a small local `pendingCreated` option list. This is required
because the mutation returns before the invalidated list query necessarily
re-fetches. The selected value must exist in the rendered `SelectItem` list, so
the component displays the newly returned `{ id, name }` option immediately and
then drops it once the parent `options` prop includes the same ID.

## Service behavior and constraints

- The coloring library requests one page of books at a time. It defaults to 50
  books per page and lets the user choose 25, 50, or 100.
- Changing a filter, the effective search term, sorting, or page size returns the
  library to page 1. Reapplying the same value does not move the user away from
  the current page.
- The current page is URL-owned. Page links include `page` and `pageSize`, so
  browser history, copied links, and opening a page in a new tab preserve the
  same result position. Page 1 and the default size of 50 are omitted from the
  URL when possible.
- The page size remains a saved coloring preference, but the current page is not
  written to PocketBase. This prevents separate browser tabs from overwriting
  each other's position.
- Every coloring-book sort includes the record ID as a stable tie-breaker so
  equal titles, dates, or completion values do not move between pages.
- `BookPublishersService.list` and `BookIllustratorsService.list` return up to 500
  items sorted by `name`.
- `createIfNotExists` trims the name, searches by exact name for the current user,
  and returns the existing row when one is found.
- `create` trims the name and raises a validation `ServiceError` if another row
  with the same exact name already exists for the current user.
- `update` checks ownership before saving and rejects duplicate exact names for
  the same user.
- `delete` checks ownership, and the PocketBase deletion guard rejects taxonomy
  rows that are still referenced by a coloring book.
- `Other` and `Unknown` are allowed as intentional user-entered names. Do not
  treat them as sentinel values.

## Common pitfalls

- Do not reuse the diamond painting `companies` or `artists` services for coloring
  books. Coloring book publishers and illustrators have their own collections,
  hooks, services, query keys, and analytics events.
- Keep inline-created options visible until the parent query list catches up. If
  the select value points at an item that is not rendered, the control can appear
  blank or inconsistent immediately after creation.
- Do not use "No publisher", "No illustrator", "Other", or "Unknown" as storage
  sentinels. Missing optional relations are represented by an empty form value and
  normalized by `ColoringService`.
- The list queries have a five-minute stale time, so mutation invalidation and the
  select's pending option bridge both matter for perceived consistency.

## Regression tests

- `src/components/coloring/__tests__/ColoringTaxonomySelect.test.tsx` verifies
  that an inline-created option appears immediately and can match the selected
  value.
- `src/services/pocketbase/__tests__/bookTaxonomy.service.test.ts` verifies that
  `Other` and `Unknown` are treated as real taxonomy names.
