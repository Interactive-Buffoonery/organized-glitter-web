# Stats API Contract

## Purpose

The stats API is the shared source of truth for React and future native clients. Metric math lives in PocketBase hooks so clients do not duplicate aggregation rules.

## Auth

All endpoints require an authenticated PocketBase user. The server derives the user from `e.auth.id`. Clients must not send a user id in query params or request bodies.

## Date Conventions

- Diamond completion metrics use `projects.date_completed`.
- Coloring page completion metrics use `coloring_pages.completed_at`.
- Diamond status metrics use the current `projects.status` value.
- Coloring book status metrics use `coloring_books.status`; coloring page status metrics use `coloring_pages.status`.
- Endpoint dates are ISO strings.
- Year filters are calendar years in the user's project data. The v1 endpoints do not apply a client timezone offset.

## Status Groupings

| Group        | Included statuses                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Wishlist     | `wishlist`                                                                                             |
| In progress  | `progress`                                                                                             |
| In stash     | `purchased`, `stash`, `kitted`                                                                         |
| All statuses | `wishlist`, `purchased`, `stash`, `kitted`, `progress`, `onhold`, `completed`, `archived`, `destashed` |

## Metrics Catalog

| Metric                   | Definition                                                                                                                 | Source                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Total kits               | Count of all projects owned by the authenticated user.                                                                     | `projects.user`                                            |
| Completed this year      | Count of projects with `date_completed` in the current calendar year.                                                      | `projects.date_completed`                                  |
| In progress              | Count of projects whose current status is `progress`.                                                                      | `projects.status`                                          |
| In stash                 | Count of projects whose current status is `purchased`, `stash`, or `kitted`.                                               | `projects.status`                                          |
| All-time completed       | Count of projects with a non-empty `date_completed`.                                                                       | `projects.date_completed`                                  |
| Wishlist size            | Count of projects whose current status is `wishlist`.                                                                      | `projects.status`                                          |
| Monthly completions      | Count of projects completed in each month of the requested year, with previous-year count, delta, and average finish time. | `projects.date_completed`, `projects.date_started`         |
| Yearly completions       | Count of projects completed in each year, plus cumulative totals.                                                          | `projects.date_completed`                                  |
| Average completion time  | Mean whole-day duration from `date_started` to `date_completed`. Projects without both valid dates are excluded.           | `projects.date_started`, `projects.date_completed`         |
| Average stash dwell time | Mean whole-day duration from `date_received` to `date_started`. Projects without both valid dates are excluded.            | `projects.date_received`, `projects.date_started`          |
| Average time to start    | Mean whole-day duration from `date_purchased` to `date_started`. Projects without both valid dates are excluded.           | `projects.date_purchased`, `projects.date_started`         |
| Collection splits        | Counts by company, artist, tag, drill shape, kit category, and max-dimension size bucket.                                  | `projects`, `companies`, `artists`, `project_tags`, `tags` |

## Coloring Metrics Catalog

| Metric                       | Definition                                                                                                                       | Source                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Total books                  | Count of all coloring books owned by the authenticated user.                                                                     | `coloring_books.user`                                                                          |
| Completed pages this year    | Count of coloring pages with `completed_at` in the requested calendar year.                                                      | `coloring_pages.completed_at`, joined through `coloring_books.user`                            |
| Active pages                 | Count of coloring pages whose current status is `in_progress`.                                                                   | `coloring_pages.status`                                                                        |
| In stash                     | Count of coloring books whose current status is `purchased` or `in_stash`.                                                       | `coloring_books.status`                                                                        |
| All-time completed pages     | Count of coloring pages with a non-empty `completed_at`.                                                                         | `coloring_pages.completed_at`                                                                  |
| Wishlist size                | Count of coloring books whose current status is `wishlist`.                                                                      | `coloring_books.status`                                                                        |
| Monthly page completions     | Count of coloring pages completed in each month of the requested year, with previous-year count, delta, and average finish time. | `coloring_pages.completed_at`, `coloring_pages.started_at`                                     |
| Yearly page completions      | Count of coloring pages completed in each year, plus cumulative totals.                                                          | `coloring_pages.completed_at`                                                                  |
| Average page completion time | Mean whole-day duration from `coloring_pages.started_at` to `coloring_pages.completed_at`. Invalid pairs skip.                   | `coloring_pages.started_at`, `coloring_pages.completed_at`                                     |
| Average book dwell time      | Mean whole-day duration from purchase or receipt to `coloring_books.date_started`. Invalid pairs skip.                           | `coloring_books.date_purchased`, `coloring_books.date_received`, `coloring_books.date_started` |
| Coloring collection splits   | Counts by book status, page status, publisher, illustrator, tags, mediums, and completion buckets.                               | `coloring_books`, `coloring_pages`, coloring taxonomy collections                              |

## Size Buckets

Size buckets use `max(width, height)`.

| Key       | Label         | Bounds                                             |
| --------- | ------------- | -------------------------------------------------- |
| `mini`    | `<30 cm`      | `0 < size < 30`                                    |
| `small`   | `30-49.9 cm`  | `30 <= size < 50`                                  |
| `medium`  | `50-69.9 cm`  | `50 <= size < 70`                                  |
| `large`   | `70-109.9 cm` | `70 <= size < 110`                                 |
| `huge`    | `110+ cm`     | `size >= 110`                                      |
| `unknown` | `Unknown`     | both dimensions are missing, zero, or non-positive |

The `/api/stats/collection` response always returns all six buckets in the order above. Clients decide whether to render zero-count buckets.

## Endpoint: `GET /api/stats/summary`

Returns the top-level stats summary for the authenticated user.

### Query Params

| Name   | Type    | Required | Behavior                                                                                             |
| ------ | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `year` | integer | No       | Valid years are 1900 through 2100. Invalid or missing values fall back to the current calendar year. |

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "year": 2026,
  "metrics": {
    "totalKits": 42,
    "completedThisYear": 6,
    "inProgress": 2,
    "inStash": 21,
    "allTimeCompleted": 18,
    "wishlistSize": 9
  },
  "statusBreakdown": {
    "wishlist": 9,
    "purchased": 3,
    "stash": 16,
    "kitted": 2,
    "progress": 2,
    "onhold": 1,
    "completed": 8,
    "archived": 1,
    "destashed": 0
  }
}
```

### SQL Sketch

```sql
SELECT status, COUNT(*)
FROM projects
WHERE user = :authUserId
GROUP BY status;
```

```sql
SELECT
  COUNT(*) AS total_kits,
  SUM(CASE WHEN date_completed >= :yearStart AND date_completed < :nextYearStart THEN 1 ELSE 0 END) AS completed_this_year,
  SUM(CASE WHEN date_completed IS NOT NULL AND date_completed != '' THEN 1 ELSE 0 END) AS all_time_completed
FROM projects
WHERE user = :authUserId;
```

## Endpoint: `GET /api/stats/completions?year=YYYY`

Returns monthly completion counts for one calendar year. All 12 months are always present.

### Query Params

| Name   | Type    | Required | Behavior                                                                                             |
| ------ | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `year` | integer | No       | Valid years are 1900 through 2100. Invalid or missing values fall back to the current calendar year. |

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "year": 2026,
  "total": 3,
  "months": [
    {
      "month": 1,
      "label": "Jan",
      "count": 2,
      "previousYearCount": 1,
      "previousYearDelta": 1,
      "averageCompletionDays": 18.5
    },
    {
      "month": 2,
      "label": "Feb",
      "count": 0,
      "previousYearCount": 0,
      "previousYearDelta": 0,
      "averageCompletionDays": null
    },
    {
      "month": 3,
      "label": "Mar",
      "count": 1,
      "previousYearCount": 2,
      "previousYearDelta": -1,
      "averageCompletionDays": 42
    },
    {
      "month": 4,
      "label": "Apr",
      "count": 0,
      "previousYearCount": 0,
      "previousYearDelta": 0,
      "averageCompletionDays": null
    }
  ]
}
```

The response always includes all 12 months. The example is shortened here for readability.

### SQL Sketch

```sql
SELECT
  CAST(strftime('%m', date_completed) AS INTEGER) AS month,
  COUNT(*) AS count,
  AVG(julianday(date_completed) - julianday(date_started)) AS averageCompletionDays
FROM projects
WHERE user = :authUserId
  AND date_completed >= :yearStart
  AND date_completed < :nextYearStart
GROUP BY month
ORDER BY month ASC;
```

## Endpoint: `GET /api/stats/completions/yearly`

Returns completion counts by year across all time. Years are returned in descending order for display, but `cumulativeCount` is calculated from oldest to newest.

### Query Params

None.

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "total": 18,
  "years": [
    { "year": 2026, "count": 6, "cumulativeCount": 18 },
    { "year": 2025, "count": 8, "cumulativeCount": 12 },
    { "year": 2024, "count": 4, "cumulativeCount": 4 }
  ]
}
```

### SQL Sketch

```sql
SELECT CAST(strftime('%Y', date_completed) AS INTEGER) AS year, COUNT(*) AS count
FROM projects
WHERE user = :authUserId
  AND date_completed IS NOT NULL
  AND date_completed != ''
GROUP BY year
ORDER BY year ASC;
```

## Endpoint: `GET /api/stats/completion-times`

Returns duration-based completion metrics.

### Query Params

None.

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "averageCompletionDays": 42.5,
  "averageStashDwellDays": 18,
  "averageTimeToStartDays": 36,
  "fastestCompletion": {
    "id": "project_id",
    "title": "Small Kit",
    "dateStarted": "2026-01-01",
    "dateCompleted": "2026-01-08",
    "days": 7
  },
  "slowestCompletion": {
    "id": "project_id_2",
    "title": "Large Kit",
    "dateStarted": "2025-01-01",
    "dateCompleted": "2025-04-01",
    "days": 90
  },
  "mostProductiveMonth": {
    "year": 2026,
    "month": 1,
    "label": "Jan 2026",
    "count": 3
  }
}
```

Unavailable duration metrics return `null`, not `0`.

### SQL Sketch

```sql
SELECT
  AVG(julianday(date_completed) - julianday(date_started)) AS averageCompletionDays,
  AVG(julianday(date_started) - julianday(date_received)) AS averageStashDwellDays,
  AVG(julianday(date_started) - julianday(date_purchased)) AS averageTimeToStartDays
FROM projects
WHERE user = :authUserId;
```

## Endpoint: `GET /api/stats/collection`

Returns collection composition metrics.

### Query Params

None.

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "topCompanies": [{ "id": "company_id", "label": "Diamond Art Club", "count": 12 }],
  "topCompaniesGroup": {
    "total": 36,
    "items": [{ "id": "company_id", "label": "Diamond Art Club", "count": 12 }],
    "otherCount": 24
  },
  "topArtists": [{ "id": "artist_id", "label": "Example Artist", "count": 5 }],
  "topArtistsGroup": {
    "total": 15,
    "items": [{ "id": "artist_id", "label": "Example Artist", "count": 5 }],
    "otherCount": 10
  },
  "topTags": [{ "id": "tag_id", "label": "Flowers", "count": 8 }],
  "topTagsGroup": {
    "total": 20,
    "items": [{ "id": "tag_id", "label": "Flowers", "count": 8 }],
    "otherCount": 12
  },
  "drillShapeSplit": [{ "key": "round", "label": "round", "count": 20 }],
  "kitCategorySplit": [{ "key": "full", "label": "full", "count": 30 }],
  "sizeBuckets": [
    { "key": "mini", "label": "<30 cm", "count": 4 },
    { "key": "small", "label": "30-49.9 cm", "count": 12 },
    { "key": "medium", "label": "50-69.9 cm", "count": 8 },
    { "key": "large", "label": "70-109.9 cm", "count": 3 },
    { "key": "huge", "label": "110+ cm", "count": 1 },
    { "key": "unknown", "label": "Unknown", "count": 0 }
  ]
}
```

Top lists are fixed at 10 rows. The parallel `*Group` objects provide the
server-backed total and `otherCount` needed to render an accurate "Other" row.

### SQL Sketch

```sql
SELECT c.id, c.name AS label, COUNT(*) AS count
FROM projects p
JOIN companies c ON c.id = p.company
WHERE p.user = :authUserId
GROUP BY c.id, c.name
ORDER BY count DESC, c.name ASC
LIMIT 10;
```

## Coloring Endpoint: `GET /api/stats/coloring/summary?year=YYYY`

Returns the top-level coloring stats summary for the authenticated user. All book and page status keys are present, even when their count is zero.

### Query Params

| Name   | Type    | Required | Behavior                                                                                             |
| ------ | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `year` | integer | No       | Valid years are 1900 through 2100. Invalid or missing values fall back to the current calendar year. |

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "year": 2026,
  "metrics": {
    "totalBooks": 18,
    "completedPagesThisYear": 42,
    "activePages": 5,
    "inStash": 10,
    "allTimeCompletedPages": 120,
    "wishlistSize": 3
  },
  "bookStatusBreakdown": {
    "wishlist": 3,
    "purchased": 4,
    "in_stash": 6,
    "in_progress": 3,
    "completed": 1,
    "archived": 1,
    "destashed": 0
  },
  "pageStatusBreakdown": {
    "not_started": 200,
    "palette_chosen": 4,
    "in_progress": 5,
    "on_hold": 1,
    "completed": 120
  }
}
```

## Coloring Endpoint: `GET /api/stats/coloring/completions?year=YYYY`

Returns monthly coloring page completion counts for one calendar year. All 12 months are always present.

The query params and monthly response shape match `/api/stats/completions`,
including `previousYearCount`, `previousYearDelta`, and `averageCompletionDays`
for each month.

## Coloring Endpoint: `GET /api/stats/coloring/completions/yearly`

Returns coloring page completion counts by year across all time. The response shape matches `/api/stats/completions/yearly`.

## Coloring Endpoint: `GET /api/stats/coloring/completion-times`

Returns coloring page completion-time and book dwell-time metrics.

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "averagePageCompletionDays": 2.4,
  "averageBookDwellDays": 18,
  "fastestPageCompletion": {
    "id": "page_id",
    "bookId": "book_id",
    "bookTitle": "Cozy Coloring Book",
    "title": "Cozy Coloring Book page 12",
    "pageNumber": 12,
    "startedAt": "2026-01-01",
    "completedAt": "2026-01-02",
    "days": 1
  },
  "slowestPageCompletion": null,
  "mostProductiveMonth": {
    "year": 2026,
    "month": 1,
    "label": "Jan 2026",
    "count": 12
  }
}
```

Unavailable duration metrics return `null`, not `0`.

## Coloring Endpoint: `GET /api/stats/coloring/collection`

Returns coloring collection composition metrics.

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "topPublishers": [{ "id": "publisher_id", "label": "Cute Books", "count": 4 }],
  "topPublishersGroup": {
    "total": 12,
    "items": [{ "id": "publisher_id", "label": "Cute Books", "count": 4 }],
    "otherCount": 8
  },
  "topIllustrators": [{ "id": "illustrator_id", "label": "Example Illustrator", "count": 3 }],
  "topIllustratorsGroup": {
    "total": 9,
    "items": [{ "id": "illustrator_id", "label": "Example Illustrator", "count": 3 }],
    "otherCount": 6
  },
  "topTags": [{ "id": "tag_id", "label": "Flowers", "count": 8 }],
  "topTagsGroup": {
    "total": 18,
    "items": [{ "id": "tag_id", "label": "Flowers", "count": 8 }],
    "otherCount": 10
  },
  "topMediums": [{ "id": "medium_id", "label": "Colored pencils", "count": 12 }],
  "topMediumsGroup": {
    "total": 30,
    "items": [{ "id": "medium_id", "label": "Colored pencils", "count": 12 }],
    "otherCount": 18
  },
  "bookStatusSplit": [{ "key": "in_progress", "label": "In progress", "count": 3 }],
  "pageStatusSplit": [{ "key": "completed", "label": "Completed", "count": 120 }],
  "completionBuckets": [
    { "key": "not_started", "label": "Not started", "count": 4 },
    { "key": "started", "label": "1-49%", "count": 3 },
    { "key": "halfway", "label": "50-99%", "count": 2 },
    { "key": "completed", "label": "Completed", "count": 1 }
  ]
}
```

Top lists are fixed at 10 rows. The parallel `*Group` objects provide the
server-backed total and `otherCount` needed to render an accurate "Other" row.

## Server-Owned Rollups And Invariants

Coloring book dashboard fields are maintained by PocketBase hooks, not by React or native clients:

- `coloring_books.completed_pages`
- `coloring_books.completion_percentage`
- `coloring_books.last_activity_at`

Lifecycle hooks normalize missing coloring page dates:

- A coloring page entering `in_progress` sets `started_at` when it is empty.
- A coloring page entering `completed` sets `completed_at` when it is empty.

Diamond project completion dates are user-entered only. Changing a project to `completed`
does not fill `date_completed`; clients must send an explicit date when the user provides one.

## Index And Access-Rule Contract

The stats hooks depend on indexes for status and date filtering:

- `coloring_pages(status)`
- `coloring_pages(completed_at)`
- `coloring_pages(book, status)`
- `coloring_books(user, status)`
- `coloring_books(user, last_activity_at)`

Coloring page progress-note writes require both note ownership and page ownership:

```text
user = @request.auth.id && page.book.user = @request.auth.id
```

This prevents a native or web client from attaching notes to another user's page even if it submits its own `user` id.

## Endpoint: `GET /api/stats/month-in-review?year=YYYY&month=MM`

Returns completed kits, progress notes, and new additions for one calendar month.

### Query Params

| Name    | Type    | Required | Behavior                                                                                             |
| ------- | ------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `year`  | integer | No       | Valid years are 1900 through 2100. Invalid or missing values fall back to the current calendar year. |
| `month` | integer | No       | Valid months are 1 through 12. Invalid or missing values fall back to the current calendar month.    |

### Response

```json
{
  "generatedAt": "2026-05-02T16:00:00.000Z",
  "year": 2026,
  "month": 5,
  "label": "May 2026",
  "completedKits": [
    {
      "id": "project_id",
      "title": "Finished Kit",
      "date": "2026-05-01",
      "company": "Diamond Art Club",
      "artist": "Example Artist"
    }
  ],
  "progressNotes": [
    {
      "id": "note_id",
      "projectId": "project_id",
      "projectTitle": "In Progress Kit",
      "date": "2026-05-03",
      "content": "Markdown note content",
      "hasImage": true
    }
  ],
  "newAdditions": [
    {
      "id": "project_id_2",
      "title": "New Kit",
      "date": "2026-05-04 10:00:00.000Z",
      "company": null,
      "artist": null
    }
  ]
}
```

### Content Format

Progress-note `content` is Markdown. It uses the app's CommonMark-compatible subset, including bold, italic, strikethrough, lists, links, and headings. Native clients can render it as Markdown rather than parsing rich text from React.

### SQL Sketch

```sql
SELECT pn.id, pn.project, p.title, pn.date, pn.content, pn.image
FROM progress_notes pn
JOIN projects p ON p.id = pn.project
WHERE p.user = :authUserId
  AND pn.date >= :monthStart
  AND pn.date < :nextMonthStart
ORDER BY pn.date DESC, pn.created DESC;
```

## Endpoint: `GET /api/stats/company-project-counts`

Returns project counts keyed by company record ID. Used by the companies list to
show how many diamond projects reference each company without N+1 queries.

### Query Params

None.

### Response

```json
{
  "counts": {
    "company_id_1": 12,
    "company_id_2": 3
  }
}
```

Companies with no projects are omitted from the response. The client defaults
missing keys to zero.

### SQL Sketch

```sql
SELECT p.company AS id, COUNT(*) AS total
FROM projects p
JOIN companies c ON c.id = p.company
WHERE p.user = :authUserId
  AND c.user = :authUserId
  AND p.company IS NOT NULL
  AND p.company != ''
GROUP BY p.company;
```

## Endpoint: `GET /api/stats/artist-project-counts`

Returns project counts keyed by artist record ID. Used by the artists list. Same
response shape as `company-project-counts`; artists with no projects are omitted.

### SQL Sketch

```sql
SELECT p.artist AS id, COUNT(*) AS total
FROM projects p
JOIN artists a ON a.id = p.artist
WHERE p.user = :authUserId
  AND a.user = :authUserId
  AND p.artist IS NOT NULL
  AND p.artist != ''
GROUP BY p.artist;
```

## Endpoint: `GET /api/stats/tag-project-counts`

Returns project counts keyed by diamond tag record ID. Used by the tags list to
display per-tag project totals in a single request.

### Query Params

None.

### Response

```json
{
  "counts": {
    "tag_id_1": 8,
    "tag_id_2": 2
  }
}
```

Tags with no project associations are omitted. The client defaults missing keys
to zero.

### SQL Sketch

```sql
SELECT pt.tag AS id, COUNT(*) AS total
FROM project_tags pt
JOIN projects p ON p.id = pt.project
JOIN tags t ON t.id = pt.tag
WHERE p.user = :authUserId
  AND t.user = :authUserId
GROUP BY pt.tag;
```

## Endpoint: `GET /api/stats/coloring-tag-book-counts`

Returns coloring book counts keyed by coloring tag record ID. Same response shape
as the diamond tag endpoint.

### Query Params

None.

### Response

```json
{
  "counts": {
    "coloring_tag_id_1": 4,
    "coloring_tag_id_2": 1
  }
}
```

### SQL Sketch

```sql
SELECT cbt.tag AS id, COUNT(*) AS total
FROM coloring_book_tags cbt
JOIN coloring_books cb ON cb.id = cbt.book
JOIN coloring_tags t ON t.id = cbt.tag
WHERE cb.user = :authUserId
  AND t.user = :authUserId
GROUP BY cbt.tag;
```

## Endpoint: `POST /api/notes/latest`

Returns the single most recent progress note for each of a set of project or
coloring page targets. Used by list views to display the latest note date without
fetching full note collections for every item. Implemented in
`pb_hooks/latest_notes.pb.js`; the client wrapper is
`src/services/pocketbase/base/latestNotes.ts`.

### Auth

Requires an authenticated user. The server validates that `userId` in the body
matches `e.auth.id`.

### Request Body

```json
{
  "craft": "diamond",
  "userId": "authenticated_user_id",
  "targetIds": ["project_id_1", "project_id_2"]
}
```

| Field       | Type       | Required | Constraints                                           |
| ----------- | ---------- | -------- | ----------------------------------------------------- |
| `craft`     | string     | Yes      | `"diamond"` or `"coloring"`.                          |
| `userId`    | string     | Yes      | Must match the authenticated user.                    |
| `targetIds` | `string[]` | Yes      | Max 100 IDs per request. Alphanumeric and underscore. |

### Response

```json
{
  "items": [
    {
      "id": "note_id",
      "targetId": "project_id_1",
      "date": "2026-09-01",
      "created": "2026-09-01 14:30:00.000Z"
    }
  ]
}
```

Each item represents the most recent progress note for one target, ordered by
`date DESC, created DESC, id DESC`. Targets with no notes are omitted.

### Batching

The client service (`fetchLatestNotes`) batches requests at 100 IDs with
concurrency 2. It returns `null` on 404 for backwards compatibility with backends
that predate this hook.

### SQL Sketch (diamond craft)

```sql
SELECT n.id, t.id AS targetId, n.date, n.created
FROM projects t
JOIN progress_notes n ON n.id = (
  SELECT candidate.id FROM progress_notes candidate
  WHERE candidate.project = t.id
  ORDER BY candidate.date DESC, candidate.created DESC, candidate.id DESC
  LIMIT 1
)
WHERE t.user = :authUserId AND t.id IN (:ids);
```

The coloring variant joins through `coloring_books` for ownership and uses
`coloring_page_progress_notes`.

## Client Contract

The response is platform-neutral. Clients may transform the data for rendering, but they should not redefine metric math, status groupings, month labels, or fallback behavior.

React consumes these endpoints through thin service methods in `projectsService` and `ColoringService`. Future SwiftUI and Android clients should call the same paths and render the same JSON shapes. All Crafts is intentionally composed client-side from the diamond and coloring responses; there is no combined backend endpoint yet.

The bulk count endpoints (`company-project-counts`, `artist-project-counts`,
`tag-project-counts`, `coloring-tag-book-counts`) and the latest-notes endpoint
are consumed by `CompaniesService`, `ArtistsService`, `TagService`,
`ColoringTagsService`, and `fetchLatestNotes` respectively. Native clients should call the same paths.

Native clients are online-first with cached reads. This contract does not include offline-first tombstones, mutation ids, conflict fields, or client-owned stats caches.

## Changelog

- 2026-10-08: Added `artist-project-counts` bulk count endpoint.
- 2026-09-07: Added bulk count endpoints (company, tag, coloring tag) and `POST /api/notes/latest` contract.
- 2026-05-02: Added yearly completions, completion-time, collection, and Month in Review endpoint contracts.
- 2026-05-02: Initial contract for `summary` and `completions` endpoints.
- 2026-05-10: Added selected-year diamond summary filtering, coloring stats endpoints, server-owned coloring rollups, and native-client contract notes.

## Completion-year choices

Dashboard year choices use the calendar year stored in `date_completed`. A
January 1 completion belongs to that year in every browser time zone, for both
date-only and PocketBase midnight timestamp representations. Invalid calendar
dates are omitted from the choices. This does not change stored dates or status
automation.
