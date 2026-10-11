# PostHog reporting specification v1

Status: proposed, dry-run review only. Baseline: `dev` at
`e0f4eca8aa0077df1eccdf6e78fe89e8c8c3aa16`. No API writes, project creation,
private chart exports, or ingestion are part of this specification.

This turns the delegated audit recommendations into candidate insights using
the existing event contract in [PostHog analytics](posthog.md). The generic
pageview templates, rageclick and CSP charts do not establish product success.
Absent signals are unavailable, not zero. Replay and autocapture stay disabled.
Consent, DNT and account opt-out remain authoritative.

## Review and implementation boundary

The tables below are versioned semantic insight specifications, not an API
payload. An owner can later translate approved definitions into the supported
PostHog Trends, Funnels, Retention, SQL/HogQL and Error Tracking interfaces.
Use a read-only SQL/HogQL insight for cumulative thresholds and mature-cohort
denominators where the built-in funnel or retention controls cannot express
the exact definition. Do not approximate them silently with default UI windows.
Do not run a script to apply these definitions. Before any later live configuration work,
confirm the current supported interface and request separate authorization.

Use UTC, complete days, and a 28-day trailing observation window ending at
00:00 today unless a row says otherwise. Show the exact date range and filters
in each insight description. Version or duplicate a definition when changing
its population, success criteria or window. Keep private validation results in
PostHog; only aggregate validation status belongs in the repository.

## Two distinct populations

| Population      | Required event filters                                                                                                                  | Missing-field policy                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ordinary web    | Event property `$host` equals `organizedglitter.app`                                                                                    | Exclude missing/other hosts from production panels; review separately. Do not use substring host matches or a person-level host property. Confirm the received property before enabling a panel. |
| Bootstrap shell | `environment` equals `production` AND `automation` equals boolean `false`, for `bootstrap_failure_shown` and `bootstrap_recovered` only | Exclude unknown environment/automation from this panel, list historical unknowns separately. Do not apply `$host` to shell events, which deliberately omit full URLs.                            |

The production hostname is the repository's canonical web hostname. Confirm
whether another hostname is currently authorized before widening this filter.
Do not infer a human visitor from an Automation label or `no_user_agent`.
Ordinary web events do not currently promise environment/automation properties;
do not invent them or apply the shell filters to them. These panels cannot prove
that all ordinary events are human activity.

For account metrics require an identified account at event time and the
owner-verified identity mapping. Use PostHog's merged person/account identity,
not raw distinct IDs counted across browsers. Anonymous traffic belongs only
in the explicitly labeled traffic/diagnostic panels. Until identification and
merge semantics are verified, account panels are blocked. Do not export IDs,
join private PocketBase data, or change identity collection to fill gaps.

## Successful actions and library growth

| Event                                      | Inclusion and library-item contribution                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `project_created`, `coloring_book_created` | Successful committed creation; one new library item per event.                                                                              |
| `import_completed`, `dac_import_completed` | `status` in `success`, `partial` AND numeric `records > 0`; contribution is `records`, successfully created project count.                  |
| `archive_import_completed`                 | `status` in `success`, `partial` AND numeric `created_library_items > 0`; contribution is `created_library_items`, new projects/books only. |

Missing, negative or nonnumeric counts are unknown and excluded from quantified
growth. Do not substitute archive `records`, `existing_records`,
`prepared_records`, `skipped`, asset counts or a start/preview event. A successful
restore of existing records contributes no new library items. Show partial
imports separately so errors are visible. Events without required counts need
a separate coverage panel. Received creation totals are not the canonical
library size and retries cannot be deduplicated by record ID with this contract.

Progress set P consists of `progress_note_added`,
`coloring_page_progress_note_added`, `coloring_page_photo_added`, and
`randomizer_spin`. These are successful product actions. A spin is a selection
action, not proof of physical craft progress; show it separately as well.
Bulk photo imports with `status` in `success`, `partial` and
`imported_photos > 0` may be a separately labeled photo-import panel, not an
implicit change to P. Metadata edits, tags, auth, pageviews, previews, failed
imports and export completions are excluded from meaningful success.

## Dashboard: productive use

| Stable insight key             | Type and exact definition                                                                                                                                                                                                                    | Denominator and caveats                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `productive-actions-v1`        | Daily Trends: unique identified accounts performing successful creation/import or P. Companion event-volume series, split by event. Ordinary-web filters on every series.                                                                    | Received productive accounts; not all registered accounts or all visitors. Zero only after signal coverage is verified.                                                                 |
| `create-import-to-progress-v1` | Ordered account funnel: first qualifying creation/import in the window, then P strictly later and within 7 elapsed days. Count each account once. Separate direct creation, CSV and archive entry panels; show craft-specific companions.    | Accounts with qualifying entry whose full 7-day follow-up has elapsed; exclude recent entrants rather than calling them failures. Same-account progression, not a same-record claim.    |
| `observed-activation-v1`       | Per account, accumulate library contributions after its first recorded qualifying creation/import. Threshold is 3 items; require P strictly after the threshold timestamp and within 7 elapsed days of entry. Count once per account.        | First recorded entrants with complete follow-up. The proposed threshold needs owner approval. Retrospective prior progress is excluded. Label first recorded, never first-ever.         |
| `productive-return-v1`         | Weekly cohort retention anchored on first recorded qualifying creation/import or P. Return must be a qualifying creation/import or P. Use elapsed intervals [7,14), [14,21), [21,28) days after anchor; each is independent, not cumulative. | For each interval use only accounts observed through its upper bound; report cohort count, eligible count and retained count before percentage. Pageviews/login do not count as return. |
| `taxonomy-use-v1`              | Daily Trends of `tag_created` with `craft = diamond`, unique identified accounts and event counts.                                                                                                                                           | Diagnostic feature adoption only; hook-based diamond creation coverage. Coloring tags and import-created tags are outside this instrumentation.                                         |

First recorded anchors require history back to the instrumentation coverage
start, not just the displayed 28 days. If complete history is unavailable,
label the cohort first observed in window and keep it separate. Do not use
retired `first_*`, `randomizer_first_spin` or `activation_completed` as current
funnel steps, denominators or conversion counts. Historical legacy panels stay
separate and labeled with their collection period.

## Dashboard: release health

| Stable insight key              | Definition                                                                                                                                                                                                                                         | Interpretation                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release-exceptions-v1`         | Ordinary-web `$exception` daily event counts and affected analytics identities, broken down by existing `release` when present. Split known external-script classification from app/unknown classification. Review Error Tracking stacks in place. | Missing release is a separate unknown series. Account denominator is not assumed. Do not silently drop unknown or external errors.                                                                   |
| `release-productive-use-v1`     | Daily productive action event counts and identified accounts by existing release, alongside `session_context` identities on the same host/release.                                                                                                 | A companion observed exposure series only. Multiple releases per account and missing exposure make a canonical crash-free user rate unavailable.                                                     |
| `release-bootstrap-v1`          | Shell population only: failure and recovery counts by release, reason and browser family, daily. Show unknown release separately.                                                                                                                  | No boot-attempt event exists. Failure percentage over all boots is unavailable. Distinct identities are not necessarily people.                                                                      |
| `release-bootstrap-recovery-v1` | Ordered identity funnel `bootstrap_failure_shown` to `bootstrap_recovered` within 5 elapsed minutes; shell filters on both steps.                                                                                                                  | Received failures with a complete follow-up window. Same-document recovery signal only; without a document ID this is an approximate identity correlation. Retry/reload recovery cannot be inferred. |
| `release-api-pressure-v1`       | Ordinary-web `api_rate_limited` counts by existing route/auth/count buckets and release when present.                                                                                                                                              | No total API-request denominator. Do not describe this as an API error rate.                                                                                                                         |

Use event-time release properties only after confirming they are present and
match the uploaded source-map release. Central release enrichment and exception
redaction are dependencies owned by separate tasks; this PR does not modify
their files or invent new collection. If release is absent, the release panel
remains blocked while unsegmented counts can be reviewed.

## Dry-run acceptance examples

Review these synthetic cases with no PostHog connection:

- A preview project creation and production note must not convert the ordinary
  web funnel. The hostname filter applies to both steps.
- A failed import with `records = 5` contributes zero. A partial CSV import with
  `records = 2` contributes two; a partial archive with `records = 20`,
  `created_library_items = 1`, `existing_records = 4`, `prepared_records = 3`
  contributes one. Missing `created_library_items` remains unknown.
- Two direct creations plus that one archive item cross the three-item
  threshold. A note before the threshold does not activate; a later note within
  the seven-day entry window does. A pageview never activates.
- A productive return on day 8 is interval-one retention; a login on day 16 is
  not interval-two retention. An account aged 10 days is excluded from the
  interval-one denominator until day 14.
- Shell `environment = production, automation = true` is excluded. Historical
  shell events missing either field stay in an unknown panel, not the false
  automation population. Ordinary `$host` events stay independent.

Before applying any plan, verify event presence, property types, timestamps,
identity coverage, duplicate behavior, release coverage and mature cohorts in
the existing project using authorized read-only aggregate checks. Record
passed/failed/unavailable for each panel. Do not copy private chart rows or
assume that generic charts provide these denominators. Analytics gaps caused
by consent, DNT, blocking and pre-instrumentation activity remain gaps.
