# Codebase map

Orientation for humans and agents before touching unfamiliar areas. Commands and style rules stay in [`../AGENTS.md`](../../AGENTS.md) (repo root); this page is **structure and boundaries**.

## Canonical references (repo root)

| Topic                                   | Location                                               |
| --------------------------------------- | ------------------------------------------------------ |
| Domain vocabulary                       | [`CONTEXT.md`](../../CONTEXT.md)                       |
| PocketBase collections and access model | [`../schema/collections.md`](../schema/collections.md) |
| Product intent                          | [`PRODUCT.md`](../../PRODUCT.md)                       |
| Visual system                           | [`DESIGN.md`](../../DESIGN.md)                         |
| Stable architecture decisions           | [`../adr/`](../adr/)                                   |

## Runtime flow (frontend)

1. [`src/main.tsx`](../../src/main.tsx): React root, QueryClient, global error handling, lazy app shell.
2. **Page atmosphere** (`index.html`): a viewport-fixed `div.page-atmosphere` sits behind the app root and paints `--page-atmosphere` (blush-to-lilac wash in Light, navy-plus-lavender bloom in Dark). The body itself is transparent; `html` carries the solid `--background` fallback for overscroll. `/links` adds `html.utility-register` to suppress the atmosphere and keep safe-area insets opaque.
3. [`src/App.tsx`](../../src/App.tsx): Providers, PWA / online gate, mounts routes inside `.mobile-app-container` (`src/index.css`). That wrapper sets viewport sizing and horizontal clipping; **vertical scroll targets the window / `document.scrollingElement`** (not an inner overflow scroller; see [`src/utils/scrollPosition.ts`](../../src/utils/scrollPosition.ts) where scroll restoration is anchored). Also mounts [`<ColoringWalkthroughGate />`](../../src/components/onboarding/ColoringWalkthroughGate.tsx), the one-time welcome modal gated on `users.coloring_walkthrough_seen`.
4. [`src/components/routing/AppRoutes.tsx`](../../src/components/routing/AppRoutes.tsx): **Route table**: public auth/marketing routes, lazy-loaded app pages, vertical gates (`diamond_painting` vs `coloring_books`).
5. [`src/components/layout/AppProviders.tsx`](../../src/components/layout/AppProviders.tsx): Context and theme wiring used by the shell.

### Web session recovery

[`src/contexts/AuthContext/AuthContext.tsx`](../../src/contexts/AuthContext/AuthContext.tsx)
owns token refresh, invalid-session cleanup, and auth state. The PocketBase
request boundary in [`src/lib/pocketbase.ts`](../../src/lib/pocketbase.ts)
signals authenticated 401 responses and locally expired tokens through
[`src/services/auth/sessionRecovery.ts`](../../src/services/auth/sessionRecovery.ts).
Before auth and private query data are cleared, active forms can hand off an
in-memory draft. `ProtectedRoute` and Login preserve the intended route. Only
the same account can restore the draft; a failed write requires a new submit.
Forms register snapshots with [`useSessionDraft`](../../src/hooks/useSessionDraft.ts)
and share keys from
[`sessionDraftKeys.ts`](../../src/services/auth/sessionDraftKeys.ts).
The session policy and form ownership rules are in
[`src/services/auth/README.md`](../../src/services/auth/README.md).

### Page readiness (`useAppReady`)

The pre-React shells in `index.html` and `about.html` use a versioned
[`public/js/loading.js`](../../public/js/loading.js) URL. Readiness is not
"every page calls `useAppReady`". The contract is:

- **Interactive routes and dashboards:** call bare `useAppReady()` from
  [`src/hooks/useAppReady.ts`](../../src/hooks/useAppReady.ts) on mount. That
  sets `#root[data-app-ready="true"]` and dispatches `app-loaded` so the
  `#app-loading` overlay fades and `#root` is revealed. In-app skeletons and
  spinners handle data loading after the splash is gone. Do not wait on
  queries; a slow query can keep the splash up until the 30s `#app-error` path.
- **Auth and root pending spinners** (`RootRoute`, `ProtectedRoute`,
  `VerticalRouteGate`): call `useHideSplash()` so users see in-app loading UI.
  They must not set `data-app-ready`.
- **Login and Register:** keep showing the form. Call `useHideSplash` while
  auth is pending or an already-authed user is redirecting (no form flash).
  Call `useAppReady` only once the auth form is shown. The first `app-loaded`
  leaves `#app-error` in the document so a hung redirect can still show Retry.
  `markAppReady` then dispatches again so `loading.js` can remove that leftover
  node.
- **`PageLoading` Suspense fallbacks:** do not call `useAppReady` or
  `useHideSplash`, and do not set `data-app-ready`. If the fallback stays
  visible for 30 seconds (including a soft nav after the login form, or a
  later hung route after a previous route error), show in-app recovery with
  Reload and Go back. That timer does not read `data-app-ready`. If
  `#app-error` is already the visible recovery, do not stack a second card.
- **Late ready:** if `#app-error` is already showing and a real page,
  login/register form, or `RouteErrorBoundary` then becomes ready
  (`markAppReady` / `useAppReady(true)`), hide `#app-error` and reveal
  `#root`. A hang that never calls `markAppReady` keeps the card.

`#root` having children is not enough: Suspense fallbacks also render there.
The startup timeout in `loading.js` re-reads `#root[data-app-ready="true"]` when
it fires at 30 seconds. Setting the marker earlier does not cancel that timer;
at fire time a ready root no-ops and an unmarked root shows `#app-error`.
`handleFatalError` still sets `data-app-ready` before dispatching `app-loaded`.
Splash dismiss via `app-loaded` does not complete the failsafe.

The coverage test in `src/pages/__tests__/appReadyCoverage.test.ts` parses TSX
syntax to check readiness calls in gates and fallbacks. Comments, literal text,
and JSX text cannot hide a call or count as one; template interpolation calls
remain visible. It also asserts that no caller uses a bang-gated
`useAppReady(!...)`. When adding a new interactive page, add it to the test's
bare-`useAppReady()` list. Login, Register, and splash-only gates have their
own assertions. The loading shell, retry, error display, and the `app-loaded`
listener stay in `public/js/loading.js` so recovery still works if the main
bundle fails. Production Vite HTML injects `/assets/*.js` into `<head>`. Source
`index.html` used to keep `/js/loading.js` at the end of `<body>`, so React
could mark ready and fire `app-loaded` before those listeners existed. The
shell scripts now live in `<head>` ahead of the module entry, a post HTML
transform keeps that order after Vite injects bundles, and `loading.js` hides
the splash immediately if `#root` is already `data-app-ready` when it boots.
Without that catch-up, Try again after the 30s failsafe can reload into a
spinning splash that never yields Sign In.

Pages live under [`src/pages/`](../../src/pages/). Feature-specific UI is grouped under [`src/components/`](../../src/components/) (dashboard, projects, coloring, randomizer, layout, `ui/` for shadcn-style primitives).

A required app-module resource failure shows the existing error and Retry
controls. If `#root` lacks `data-app-ready="true"` at 30 seconds, the shell
shows recovery UI even if splash already dismissed. `ProtectedLazyRoute` wraps
innermost-first: ProtectedRoute, then Suspense, then RouteErrorBoundary.
ProtectedRoute stays inside Suspense so a hung chunk cannot mark ready. The
error boundary stays outside Suspense so a rejected lazy chunk reaches the
chunk-load UI and marks the app ready (so Try Again is not covered by
`#app-error`). This still covers a resource that failed before its listener
was installed. Mounting React does not start a separate success timer.
Elapsed time is never treated as successful startup. Optional scripts and
post-startup resource errors do not replace a working app. While
`#app-loading` or `#app-error` is the visible shell, `#root` is inert. That
inert state is cleared when the app is actually revealed. `RouteErrorBoundary`
recovery does not inert `#root`. Recovery headings in `RouteErrorBoundary` and
the `PageLoading` 30s card focus with
[`focusWhenRootInteractive`](../../src/utils/focusWhenRootInteractive.ts), a
shared helper that defers focus through a `MutationObserver` until `#root`
drops the `inert` attribute.

The static startup handlers ignore recognized extension messaging failures and
masked cross-origin script errors, matching the React fatal-error handler. The
startup deadline stays armed if no real page becomes ready. A displayed shell
failure followed by readiness emits `bootstrap_recovered` once; see
[`PostHog analytics`](../analytics/posthog.md) for its diagnostic fields.

Root [`src/`](../../src/) is the current Vite web app and is web-only. The
native SwiftUI app lives in `Interactive-Buffoonery/organized-glitter-app`;
backend sharing is contract-first and app-to-app source imports are not allowed.

## Library pagination

[`LibraryPagination`](../../src/components/ui/LibraryPagination.tsx) is the
shared pagination control used by both the diamond projects dashboard and the
coloring library. It renders page numbers, previous/next links, a page-size
selector (25/50/100), and a `Showing X-Y of Z` status line. Props include
configurable `itemLabel`/`itemsLabel`, an optional `getPageHref` for real
linkable page URLs (preserving modifier-click and new-tab behavior), and
`isLoading`/`disabled` busy states.

### Diamond dashboard pagination

The diamond dashboard requests one page of projects at a time (default 25).
`page` and `pageSize` hydrate from the URL, and page links include both values
for later pages. An otherwise-default page-one URL retains `page=1` so a new
tab uses that result snapshot instead of restoring saved filters. The URL also
carries every result-defining filter and sort:
status, company, artist, tags, search term and mode, drill shape, completion year,
inclusion flags, sort field, and sort direction. Invalid values fall back to
defaults, and default values are omitted when possible. Page changes add a
browser history entry; changes to search, filters, and sorting reset to page 1
in the current entry. Back and Forward restore the full result snapshot. A
page is corrected to the last valid page only after a successful current
result confirms it is out of range. An empty later page in deep search gets an
exact count to establish that bound. Page size remains a saved preference,
while the current page is not saved to PocketBase.

The diamond URL helper keeps each canonical filter name, state field, parser,
and serializer in one mapping. The same mapping selects URL defaults, excluding
the device's view preference. Pagination retains its shared page and size rules;
legacy `tag` remains a parsing fallback and serializers emit repeated `tags`.

### Coloring library pagination

The coloring library requests one page of books at a time (default 50). Page
and page size live in the URL (`page`, `pageSize`) so browser history, shared
links, and new-tab navigation preserve the same result position. Page 1 and
the default size of 50 are omitted from the URL when possible.
[`ColoringFilterContext`](../../src/contexts/ColoringFilterContext/) manages
URL hydration through
[`urlHydration.ts`](../../src/contexts/ColoringFilterContext/urlHydration.ts)
and synchronizes URL search parameters on every filter change. Changing a
filter, the effective search term, sorting, or page size resets to page 1.

Page size is a saved coloring preference, but the current page is not written
to PocketBase, so separate tabs cannot overwrite each other's position. Book
and page detail links carry a validated `returnTo` URL through
[`coloringBookNavigation.ts`](../../src/pages/coloringBookNavigation.ts) so
"Back to coloring" and delete redirects land on the same paginated view.

Every coloring-book sort includes the record ID as a stable tie-breaker so
equal titles, dates, or completion values do not shuffle between pages.

## Data and PocketBase

- **Client singleton:** [`src/lib/pocketbase.ts`](../../src/lib/pocketbase.ts).
- [`src/services/auth.ts`](../../src/services/auth.ts) is the public auth facade;
  implementation lives in focused modules under
  [`src/services/auth/`](../../src/services/auth/).
- **Service layer:** [`src/services/pocketbase/`](../../src/services/pocketbase/): collection access, query shaping, and mutations; keep PocketBase-specific logic here rather than in leaf components where possible. [`colorReferences.service.ts`](../../src/services/pocketbase/colorReferences.service.ts) owns all swatch mutations through `save()` (interactive) and `restore()` (archive import); restore responses include `referenceId` and `addedPhotoCount` for import accounting. Base utilities under `src/services/pocketbase/base/` include `mapWithConcurrency` for parallel batched requests, `NoteListCursor` for paginated note feeds, and `latestNotes` for bulk latest-note lookups via the server hook.
- **Merged notes pagination:** [`NotesFeedService`](../../src/services/pocketbase/notesFeed.service.ts) starts an all-craft feed without a continuation. Every later merged page must pass the previous result's `nextContinuation`; callers must not derive merged pages from a numeric offset alone. Merged `totalItems` and `totalPages` describe the initial load and set `totalsAreSnapshot` to `true`; only `nextContinuation` determines whether another merged page exists. Craft-specific feeds continue to use numeric pages and return current totals.
- **Service-layer base utilities:** [`src/services/pocketbase/base/`](../../src/services/pocketbase/base/) contains shared primitives used by multiple services. [`mapWithConcurrency`](../../src/services/pocketbase/base/mapWithConcurrency.ts) runs an array of async operations with a bounded worker pool and fails fast on the first error; it is used by the overview feed and notes feed to bound parallel PocketBase queries. [`NoteListCursor`](../../src/services/pocketbase/base/noteListCursor.ts) defines the keyset cursor shape (`id`, `date`, `createdAt`) that powers deterministic cross-craft notes pagination.
- **Complete taxonomy lists:** [`listAllPages`](../../src/services/pocketbase/base/listAllPages.ts) requests 500 records at a time for selectors that need every option. Each caller keeps its own user filter and stable sort; a later-page error rejects the full result.
- **Hooks:** [`src/hooks/queries/`](../../src/hooks/queries/), [`src/hooks/mutations/`](../../src/hooks/mutations/), domain splits under [`src/hooks/coloring/`](../../src/hooks/coloring/). Coloring medium mutations use a typed cache helper (`coloringMediumMutationCache.ts`) for optimistic updates; the pattern keeps sort-stable merge logic testable outside React Query.
- **Unsubmitted form recovery:** [`src/hooks/drafts/`](../../src/hooks/drafts/) owns device-local checkpoints for new and edit project and coloring book forms. `useRecoverableDraft` handles restore/discard, account and backend identity, expiry, and confirmed-save cleanup. The form adapters select JSON-safe fields; photos stay in memory and must be selected again after recovery. Deliberate sign-out clears this account's local drafts. Progress-note and feedback forms do not use draft persistence.
- **Diamond project mutations:** [`src/hooks/mutations/projectCommands.ts`](../../src/hooks/mutations/projectCommands.ts) defines typed command inputs and form-to-command mappers; [`projectMutationAdapters.ts`](../../src/hooks/mutations/projectMutationAdapters.ts) converts commands into FormData with taxonomy resolution and field clearing. See [`../project-mutation-architecture.md`](../project-mutation-architecture.md) for the full layered pattern and the three-intent update model.
- **Validation shapes:** [`src/schemas/`](../../src/schemas/) (Zod).
- **Generated types:** [`src/types/pocketbase.types.ts`](../../src/types/pocketbase.types.ts) (and local variant when used); workflow in [`../pocketbase-typegen.md`](../pocketbase-typegen.md).

Source-link cards use a bundled link icon. Rendering a saved URL must not request
a third-party favicon or disclose the stored domain before the user opens it.

## Archive export and import

[`src/features/import-export/archive/`](../../src/features/import-export/archive/) contains the ZIP archive backup and restore pipeline. [`exportArchive.ts`](../../src/features/import-export/archive/exportArchive.ts) builds a schema-version-2 ZIP including CSV data, photos, and swatch photos. [`importArchive.ts`](../../src/features/import-export/archive/importArchive.ts) reads the ZIP and restores records into the current account with idempotent retry keys; schema version 1 archives remain importable. [`fileTokenSession.ts`](../../src/features/import-export/archive/fileTokenSession.ts) manages a refreshing PocketBase file token (90-second refresh cycle, deduplicating concurrent calls) for downloading protected swatch photos during long exports. [`importInvalidation.ts`](../../src/features/import-export/archive/importInvalidation.ts) batch-invalidates React Query caches after a restore completes. Contracts: [`../import-export.md`](../import-export.md) and [`../color-codes-and-swatches.md`](../color-codes-and-swatches.md).

[`archiveImportRecovery.ts`](../../src/features/import-export/archive/archiveImportRecovery.ts) manages browser-local recovery checkpoints scoped by account and archive fingerprint. Diamond project checkpoints preserve each archive ref's destination record ID and unfinished tag work across retries so two archived projects with the same title and source URL stay distinct. Completed diamond checkpoints expire after 30 days; checkpoints with unfinished tag work are retained until that work succeeds. Existing account records are matched at most once per restore; ambiguous matches are reported instead of merging. Archive restores for the same account are serialized in the browser so overlapping restores cannot create duplicate records. The result alert now shows all errors through an expandable, paginated list (batches of 100).

## Complete taxonomy reads

`useAllCompanies`, artist consumers, diamond tag consumers, and coloring book
publisher and illustrator selectors retrieve complete owner-scoped lists through
bounded requests (500 taxonomy records or 200 tags per page). Pages use stable
name/ID ordering. A later-page failure rejects the complete read instead of
presenting earlier pages as a successful, incomplete list. This contract does
not change explicitly paginated list views.

## Randomizer request and spin lifecycle

`src/features/randomizer/session/` owns URL selection, target-pool reconciliation,
spin metadata, and result state. `useRandomizer` connects that session to the
existing query and mutation hooks and adds notes and next-up actions. PocketBase
filters, target mapping, and spin writes remain in `src/services/pocketbase/`.

An intentional `items=none` selection survives eligibility filter changes,
including a filtered empty pool and reopening that URL. Explicitly unchecked
status filters stay empty after reload. Only a confirmed empty
library for the active craft mode clears `items=none`, so newly added items use
the default selection. This uses a one-record ownership-filtered presence check
without status filters or a total count, only when select-none meets an empty
pool. Pending, failed, or refreshing presence reads preserve select-none.
Other stale `items` or legacy `projects` IDs are cleared after a successful empty
pool. Cleanup writes to history only when either selection parameter is present.
Loading targets, failed reads, pending craft settings, or an absent account do
not clear URL selections.

A target pool belongs to one account, craft mode, and eligibility selection.
Changing that identity must not make the previous pool eligible for a spin if
the new request fails. Refreshed project measurements update section estimates
without resetting an unchanged selection.

A same-pool refresh failure cancels an active wheel session and gates new
spins, but preserves the completed result, section draft, saved spin ID, and
pending result operations. Recovery must not revive an interrupted callback. Background membership changes
also preserve the completed result and section draft, even when the picked
target leaves the eligible pool; new spins use only current eligible targets.
Explicit selection, account, mode, and eligibility changes reset the result.

Changing the selected pool cancels an active wheel spin. Its old completion
cannot publish a result, including after clearing and reselecting the same
items. Wheel click and keyboard activation share the same guarded action.
Book-to-page results and failures are announced; focus moves when the focused
book action is replaced by its page result.

## Backend in this repo (not the Vite bundle)

| Path                                     | Role                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| [`pb_migrations/`](../../pb_migrations/) | PocketBase schema migrations (committed, dashboard-aligned).              |
| [`pb_hooks/`](../../pb_hooks/)           | PocketBase JSVM hooks, including the authenticated feedback route.        |
| [`api/`](../../api/)                     | Legacy local server routes, including feedback. Secrets stay server-side. |

Local PocketBase workflow: [`../pocketbase/local-development.md`](../pocketbase/local-development.md).

### Feedback submission

[`src/lib/feedback-email-service.ts`](../../src/lib/feedback-email-service.ts)
sends signed-in user feedback to PocketBase's
`POST /api/organized-glitter/feedback` route through
[`src/services/pocketbase/feedback.service.ts`](../../src/services/pocketbase/feedback.service.ts).
The route in [`pb_hooks/feedback.pb.js`](../../pb_hooks/feedback.pb.js) requires a
verified user and sends through PocketBase's configured mail client. If the API
call fails for an error other than client validation, auth, rate limit, or server
failure, the service opens a prefilled `mailto:` link but reports failure so the
dialog stays open. Local development logs the feedback instead of calling the
API. The dialog UI is in
[`src/components/FeedbackDialog.tsx`](../../src/components/FeedbackDialog.tsx).

## Tests

| Path                                                                   | Role                                                                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/**/__tests__/**`](../../src), [`src/**/*.test.ts(x)`](../../src) | Vitest + Testing Library (unit and component).                                                                                                        |
| [`test/*.test.ts`](../../test/)                                        | App-shell, CSS contract, theme, and build-script tests (Vitest). `test/setup.ts` is the shared Vitest setup file.                                     |
| [`scripts/__tests__/`](../../scripts/__tests__/)                       | CI tooling and script behavioral tests (Vitest): workflow linting, source-map upload, CI result, QA harness, PocketBase scripts, and OpenCode review. |
| [`e2e/`](../../e2e/)                                                   | Playwright; see [`../testing-playwright.md`](../testing-playwright.md).                                                                               |

Vitest configuration lives in `vitest.config.ts`. Vite build configuration stays
in `vite.config.ts`; package scripts select the runner without duplicating its
settings.

## Tooling and dead code

Use these before large refactors; file issues for anything you do not fix in the same PR.

```bash
pnpm lint
pnpm deadcode:knip
pnpm deadcode:ts-prune
```

Narrative audits and historical findings: [`../audits/README.md`](../audits/README.md).

## Related documentation

- Design implementation: [`../design-system/overview.md`](../design-system/overview.md)
- Agent workflow (issues, triage): [`../agents/`](../agents/)
