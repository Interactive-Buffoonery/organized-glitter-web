# Coloring book save workflow

Status: active

Last verified: 2026-09-27 against `src/components/coloring/ColoringBookForm.tsx`,
`src/pages/NewColoringBook.tsx`, and `src/services/pocketbase/coloring.service.ts`.

## Purpose

Coloring book saves combine a primary PocketBase record, optional cover image upload,
optional taxonomy records, coloring tags, React Query cache updates, notifications, and
navigation. The workflow treats the book record as the durable save boundary. Tag sync,
notifications, and some cache refreshes are follow-up side effects.

## Codepaths

- Form shell: `src/components/coloring/ColoringBookForm.tsx`
- Cover image controls: `src/components/coloring/ColoringBookCoverPanel.tsx`
- Create page orchestration: `src/pages/NewColoringBook.tsx`
- Edit page orchestration: `src/pages/EditColoringBook.tsx`
- Mutation hooks:
  - `src/hooks/mutations/coloring/useCreateColoringBook.ts`
  - `src/hooks/mutations/coloring/useUpdateColoringBook.ts`
- Cache lifecycle: `src/hooks/mutations/coloring/coloringMutationCache.ts`
- PocketBase service: `src/services/pocketbase/coloring.service.ts`
- Query keys: `src/hooks/queries/queryKeys.ts`

## Create flow

1. `ColoringBookForm` validates `ColoringBookFormValues`.
2. The form sets an immediate local submit lock before awaiting `onSubmit`.
3. `NewColoringBook` trims and maps form values to `CreateColoringBookInput`.
4. `useCreateColoringBook` calls `ColoringService.createBookWithTags(input, tagIds)`.
5. `ColoringService.createBookWithTags` creates the book first, then syncs selected tags.
6. A confirmed primary write retires the local draft before tag sync. The create
   page awaits the shared best-effort cache refresh before navigation.
7. The user sees either success or a tag-sync warning, then navigates to `/coloring/:id`.

## Save boundary and partial failures

The book record is the primary save. Once `createBook` succeeds, follow-up failures should not
turn the user flow into a failed create.

| Failure point                          | Current create behavior                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| Book create fails                      | Throw through the mutation and show "Could not add coloring book".                |
| Tag sync fails after create            | Return `{ book, tagSyncError }`, warn the user, and still navigate.               |
| Post-create cache invalidation rejects | Log `Post-create coloring book cache invalidation failed`, keep the success path. |
| Success or warning notification throws | Log `Notification failed after coloring book save`, keep navigation.              |

Edit saves use the same `SaveBookWithTagsResult` service contract for tag sync.
They retire their local draft at the primary write, before awaited cache
invalidations. The shared form returns explicit success or failure so a caught
error does not clear the user's inputs. Interrupted create responses warn users
to check their library before retrying.

`ColoringBookForm` checkpoints JSON-safe fields on this device for both page
and drawer editors. It pauses for an explicit restore or discard choice. Cover
files are not stored; after recovery, the user selects the cover again or
chooses to continue without it. A saved cover stays on the server unless the
user explicitly removes it.

## Duplicate submit guard

Do not rely only on React Query's `isPending` flag to prevent duplicate creates. A user can
activate the submit button again before parent pending state propagates. `ColoringBookForm`
therefore combines:

- parent `isSubmitting`
- local `isSubmitLocked` state for rendering disabled controls
- `submitLockRef` for same-tick duplicate event protection

The lock covers the footer submit action, the form submit event, cover removal, file input,
and tag controls. Keep `onSubmit` pending until the save flow has reached its intended
navigation or error state so the lock represents the full user-visible operation.

## Cache invalidation checklist

The create mutation hook sets `queryKeys.coloring.books.detail(book.id)` and invalidates
`queryKeys.coloring.books.all`. Create and edit forms await
`refreshColoringBookAfterFormSave`, which refreshes:

```ts
[
  queryKeys.coloring.books.all,
  queryKeys.coloring.pages.all,
  queryKeys.coloring.books.detail(book.id),
  queryKeys.coloring.tags.stats(),
];
```

The helper uses `Promise.allSettled` so a saved book does not look failed because a refetch
trigger rejected. It logs rejected invalidations with the index and reason. It also owns
book and page detail/list cache work for the related coloring mutation hooks. Stats and
analytics remain in those hooks.

## Regression tests

When changing this workflow, keep coverage for:

- duplicate submit clicks call the submit handler once
- cover and tag controls disable during the immediate submit lock
- selected tags are passed to the create mutation
- tag sync failure warns but still navigates to the saved book
- create-page cache invalidation failure logs but does not block navigation
- notification failure logs but does not block navigation
