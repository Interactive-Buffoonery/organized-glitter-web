# Query Key Inventory

Canonical query keys and their invalidation rules. Reference during migration to prevent cache drift.

Source: `src/hooks/queries/queryKeys.ts` + `randomizerQueryKeys` in `useSpinHistory.tsx`

---

## Key Hierarchy

### projects

| Key                                                   | Factory                                           | Used By                          |
| ----------------------------------------------------- | ------------------------------------------------- | -------------------------------- |
| `['projects']`                                        | `queryKeys.projects.all`                          | Top-level invalidation target    |
| `['projects', 'list']`                                | `queryKeys.projects.lists()`                      | Base for all project lists       |
| `['projects', 'list', hash, stable]`                  | `queryKeys.projects.list(userId, params)`         | Specific filtered/paginated list |
| `['projects', 'list', 'status-counts', hash, stable]` | `queryKeys.projects.statusCounts(userId, params)` | Dashboard chip counts            |
| `['projects', 'list', 'undated-count', hash, stable]` | `queryKeys.projects.undatedCount(userId, params)` | Missing sort-value divider count |
| `['projects', 'detail']`                              | `queryKeys.projects.details()`                    | Base for all project details     |
| `['projects', 'detail', id]`                          | `queryKeys.projects.detail(id)`                   | Specific project detail          |

**Invalidated by:**

- Create project -> `projects.lists()`, `companies.lists()`, `artists.lists()`, `tags.lists()` (if tags attached)
- Update project -> `projects.detail(id)`, `projects.lists()`
- Update status -> `projects.detail(id)`, `projects.lists()`
- Delete project -> `projects.detail(id)` (removed), `projects.lists()`, `progressNotes.list(id)` (removed)
- Image update -> `projects.detail(id)`

### companies

| Key                                   | Factory                                    | Used By                        |
| ------------------------------------- | ------------------------------------------ | ------------------------------ |
| `['companies']`                       | `queryKeys.companies.all`                  | Top-level invalidation target  |
| `['companies', 'list']`               | `queryKeys.companies.lists()`              | Base for company lists         |
| `['companies', 'list', hash, params]` | `queryKeys.companies.list(userId, params)` | Paginated company list         |
| `['companies', 'all-for-user', hash]` | `queryKeys.companies.allForUser(userId)`   | All companies for autocomplete |
| `['companies', 'detail', id]`         | `queryKeys.companies.detail(id)`           | Specific company detail        |

**Invalidated by:**

- CRUD via `useEntityCRUD` -> `companies.lists()`, `companies.detail(id)`
- Create project (if new company) -> `companies.lists()`

### artists

| Key                         | Factory                          | Used By                       |
| --------------------------- | -------------------------------- | ----------------------------- |
| `['artists']`               | `queryKeys.artists.all`          | Top-level invalidation target |
| `['artists', 'list']`       | `queryKeys.artists.lists()`      | Base for artist lists         |
| `['artists', 'list', hash]` | `queryKeys.artists.list(userId)` | User's artist list            |
| `['artists', 'detail', id]` | `queryKeys.artists.detail(id)`   | Specific artist detail        |

**Invalidated by:**

- CRUD via `useEntityCRUD` -> `artists.lists()`, `artists.detail(id)`
- Create project (if new artist) -> `artists.lists()`

### tags

| Key                                  | Factory                               | Used By                       |
| ------------------------------------ | ------------------------------------- | ----------------------------- |
| `['tags']`                           | `queryKeys.tags.all`                  | Top-level invalidation target |
| `['tags', 'list']`                   | `queryKeys.tags.lists()`              | Base for tag lists            |
| `['tags', 'list', hash]`             | `queryKeys.tags.list(userId)`         | User's tag list               |
| `['tags', 'detail', id]`             | `queryKeys.tags.detail(id)`           | Specific tag detail           |
| `['tags', 'stats']`                  | `queryKeys.tags.stats()`              | Base for tag stats            |
| `['tags', 'stats', hash, stableIds]` | `queryKeys.tags.stat(userId, tagIds)` | Specific tag usage stats      |

**Invalidated by:**

- Update tag -> `tags.lists()`, `tags.stats()`, `projects.lists()`
- Delete tag -> `tags.lists()`, `tags.stats()`, `projects.lists()`, `projects.details()`

### coloring.books

| Key                                  | Factory                                  | Used By                        |
| ------------------------------------ | ---------------------------------------- | ------------------------------ |
| `['coloring-books']`                 | `queryKeys.coloring.books.all`           | Top-level invalidation target  |
| `['coloring-books', 'list']`         | `queryKeys.coloring.books.lists()`       | Base for coloring book lists   |
| `['coloring-books', 'list', stable]` | `queryKeys.coloring.books.list(filters)` | Filtered coloring book list    |
| `['coloring-books', 'detail']`       | `queryKeys.coloring.books.details()`     | Base for coloring book details |
| `['coloring-books', 'detail', id]`   | `queryKeys.coloring.books.detail(id)`    | Specific coloring book detail  |

**Invalidated by:**

- Create coloring book -> `coloring.books.all`; the create page also refreshes
  `coloring.books.detail(id)`, `coloring.pages.all`, and `coloring.tags.stats()` before
  navigation.
- Update coloring book -> `coloring.books.all`, `coloring.books.detail(id)`; the edit page also
  refreshes `coloring.pages.all` and `coloring.tags.stats()` after saving.
- Delete coloring book -> `coloring.books.detail(id)` (removed), `coloring.books.all`,
  `coloring.pages.all` (removed and invalidated).
- Update or reveal coloring page -> `coloring.pages.all`.
- Coloring page progress note mutations -> `coloring.pages.detail(pageId)`,
  `coloring.pages.all`, `coloring.books.all`.

### coloring.pages

| Key                                    | Factory                                   | Used By                        |
| -------------------------------------- | ----------------------------------------- | ------------------------------ |
| `['coloring-pages']`                   | `queryKeys.coloring.pages.all`            | Top-level invalidation target  |
| `['coloring-pages', 'list']`           | `queryKeys.coloring.pages.lists()`        | Base for coloring page lists   |
| `['coloring-pages', 'list', stable]`   | `queryKeys.coloring.pages.list(filters)`  | Book-scoped coloring page list |
| `['coloring-pages', 'detail']`         | `queryKeys.coloring.pages.details()`      | Base for coloring page details |
| `['coloring-pages', 'detail', pageId]` | `queryKeys.coloring.pages.detail(pageId)` | Specific coloring page detail  |

**Invalidated by:**

- Create or update coloring book page flow -> `coloring.pages.all` so book-backed page lists
  refetch after book metadata or tag changes.
- Delete coloring book -> `coloring.pages.all` (removed and invalidated).
- Update or reveal coloring page -> `coloring.pages.detail(pageId)`, `coloring.pages.all`.
- Coloring page progress note mutations -> `coloring.pages.detail(pageId)`,
  `coloring.pages.all`, `coloring.books.all`.

### coloring.tags

| Key                                           | Factory                                     | Used By                       |
| --------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `['coloring-tags']`                           | `queryKeys.coloring.tags.all`               | Top-level invalidation target |
| `['coloring-tags', 'list']`                   | `queryKeys.coloring.tags.lists()`           | Base for coloring tag lists   |
| `['coloring-tags', 'list', hash]`             | `queryKeys.coloring.tags.list(userId)`      | User's coloring tag list      |
| `['coloring-tags', 'stats']`                  | `queryKeys.coloring.tags.stats()`           | Base for coloring tag stats   |
| `['coloring-tags', 'stats', hash, stableIds]` | `queryKeys.coloring.tags.stat(userId, ids)` | Coloring book usage by tag    |

**Invalidated by:**

- Create/update coloring book tags -> `coloring.books.all`, `coloring.books.detail(id)`, `coloring.tags.stats()`
- Create/update/delete coloring tag -> `coloring.tags.lists()`, `coloring.tags.stats()`, `coloring.books.all`

### progressNotes

| Key                                    | Factory                                   | Used By                       |
| -------------------------------------- | ----------------------------------------- | ----------------------------- |
| `['progressNotes']`                    | `queryKeys.progressNotes.all`             | Top-level invalidation target |
| `['progressNotes', 'list']`            | `queryKeys.progressNotes.lists()`         | Base for note lists           |
| `['progressNotes', 'list', projectId]` | `queryKeys.progressNotes.list(projectId)` | Notes for specific project    |

**Invalidated by:**

- Create note -> `progressNotes.list(projectId)`, `projects.detail(projectId)`
- Update note -> `progressNotes.list(projectId)`
- Delete note -> `progressNotes.list(projectId)`, `projects.detail(projectId)`
- Update note image -> `progressNotes.list(projectId)`

### notesFeed

| Key                                | Factory                                  | Used By                         |
| ---------------------------------- | ---------------------------------------- | ------------------------------- |
| `['notesFeed']`                    | `queryKeys.notesFeed.all`                | Top-level invalidation target   |
| `['notesFeed', 'list']`            | `queryKeys.notesFeed.lists()`            | Base for cross-craft feed lists |
| `['notesFeed', 'list', hash, key]` | `queryKeys.notesFeed.list(user, params)` | Notes page infinite feed        |

**Invalidated by:**

- Diamond progress note create/update/delete/image removal -> `invalidateNotesFeedQueries`
- Coloring page progress note create/update/delete/image removal -> `invalidateNotesFeedQueries`
- The helper uses `notesFeed.all` by default and supports scoped list invalidation when caller context is available.

### noteTargets

| Key                                             | Factory                                              | Used By                             |
| ----------------------------------------------- | ---------------------------------------------------- | ----------------------------------- |
| `['noteTargets']`                               | `queryKeys.noteTargets.all`                          | Top-level invalidation target       |
| `['noteTargets', 'list']`                       | `queryKeys.noteTargets.lists()`                      | Base for add-note target lists      |
| `['noteTargets', 'list', hash, key]`            | `queryKeys.noteTargets.list(userId, params)`         | General progress-note target picker |
| `['noteTargets', 'pages-for-book', hash, book]` | `queryKeys.noteTargets.pagesForBook(userId, bookId)` | Coloring-book scoped target picker  |

**Invalidation notes:**

- Progress note creation invalidates the underlying note and notes-feed data.
- Target lists are short-lived picker data with a two-minute stale time, so they do not need broad mutation invalidation today.

### user

| Key                                   | Factory                                   | Used By                       |
| ------------------------------------- | ----------------------------------------- | ----------------------------- |
| `['user']`                            | `queryKeys.user.all`                      | Top-level invalidation target |
| `['user', 'profile', hash]`           | `queryKeys.user.profile(userId)`          | User profile data             |
| `['user', 'beta-tester', hash]`       | `queryKeys.user.betaTesterStatus(userId)` | Beta tester flag              |
| `['user', 'optimistic-avatar', hash]` | `queryKeys.user.optimisticAvatar(userId)` | Optimistic avatar URL         |

**Invalidated by:**

- Update timezone -> `user.profile(userId)`, `['auth']`
- Update beta tester -> `user.betaTesterStatus(userId)`, `user.profile(userId)`
- Upload avatar -> `user.optimisticAvatar(userId)` (set/removed), `user.profile(userId)`
- Remove avatar -> `user.optimisticAvatar(userId)` (removed), `user.profile(userId)`

### stats

| Key                                                   | Factory                                                    | Used By                      |
| ----------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| `['stats']`                                           | `queryKeys.stats.all`                                      | Archive restore invalidation |
| `['stats', 'overview', hash]`                         | `queryKeys.stats.overview(userId)`                         | Overview mixed activity feed |
| `['stats', 'availableYears', hash]`                   | `queryKeys.stats.availableYears(userId)`                   | Diamond year filter options  |
| `['stats', 'summary', hash, year]`                    | `queryKeys.stats.summary(userId, year)`                    | Diamond summary              |
| `['stats', 'completionsByMonth', hash, year]`         | `queryKeys.stats.completionsByMonth(userId, year)`         | Diamond monthly completions  |
| `['stats', 'completionsYearly', hash]`                | `queryKeys.stats.completionsYearly(userId)`                | Diamond yearly completions   |
| `['stats', 'completionTimes', hash]`                  | `queryKeys.stats.completionTimes(userId)`                  | Diamond completion times     |
| `['stats', 'collection', hash]`                       | `queryKeys.stats.collection(userId)`                       | Diamond collection           |
| `['stats', 'coloringSummary', hash, year]`            | `queryKeys.stats.coloringSummary(userId, year)`            | Coloring summary             |
| `['stats', 'coloringCompletionsByMonth', hash, year]` | `queryKeys.stats.coloringCompletionsByMonth(userId, year)` | Coloring monthly completions |
| `['stats', 'coloringCompletionsYearly', hash]`        | `queryKeys.stats.coloringCompletionsYearly(userId)`        | Coloring yearly completions  |
| `['stats', 'coloringCompletionTimes', hash]`          | `queryKeys.stats.coloringCompletionTimes(userId)`          | Coloring completion times    |
| `['stats', 'coloringCollection', hash]`               | `queryKeys.stats.coloringCollection(userId)`               | Coloring collection          |

**Invalidated by:** `invalidateStatsQueries` selects the mixed overview plus the
affected craft's Stats projections. Project create, update, status, dates,
archive, and delete refresh diamond Stats; editing only general notes refreshes
Overview because it changes the project's fallback activity time, but leaves
diamond aggregates cached.
Coloring book and page writes refresh
coloring Stats. Progress-note adds and deletes refresh the mixed overview;
content edits and image removal leave it cached. Company,
artist, and tag edits or deletes refresh diamond Stats; coloring medium and
publisher or illustrator renames, plus medium or tag deletes, refresh coloring
Stats. Archive restore invalidates all Stats.
Adding or removing a tag on an existing diamond project also refreshes diamond
Stats. Selecting tags in an unsaved form does not.
Project writes also invalidate `queryKeys.projects.lists()`, which contains the
dashboard status-count keys under its prefix.

### randomizer (separate key factory)

| Key                                          | Factory                                     | Used By                       |
| -------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `['randomizer']`                             | `randomizerQueryKeys.all`                   | Top-level invalidation target |
| `['randomizer', 'history', userId, options]` | `randomizerQueryKeys.history(userId, opts)` | Spin history list             |
| `['randomizer', 'count', userId]`            | `randomizerQueryKeys.count(userId)`         | Total spin count              |

**Invalidated by:**

- Create spin -> `randomizerQueryKeys.all` (broad), plus optimistic updates to `history` and `count`
- Reset history -> `randomizerQueryKeys.count(userId)`

---

## Special Keys

| Key        | Source                                | Notes                                                     |
| ---------- | ------------------------------------- | --------------------------------------------------------- |
| `['auth']` | Inline in `useUpdateTimezoneMutation` | Invalidated after timezone update to refresh auth context |

---

## Migration Notes

- `randomizerQueryKeys` lives in `useSpinHistory.tsx`, not in `queryKeys.ts`. Consider consolidating into `queryKeys.ts` during Phase 3.
- The `['auth']` key is used inline without a factory. Consider adding `queryKeys.auth.all` if auth queries are formalized.
- Overview now uses `queryKeys.stats.overview(userId)` for the mixed activity feed and
  snapshot counts.
- Project keys, notes feed keys, coloring list keys, and tag stat keys now use
  shared query-key normalization in `queryKeys.ts`.
- Project list, dashboard status-count, and undated-count query shapes are
  adapted through `projectCollectionQuery.ts`; status counts intentionally
  exclude status, sort, pagination, view type, archived, and destashed display
  toggles from their stable key.
- Array normalization sorts a copy. Query-key builders must not mutate caller-owned
  arrays.
