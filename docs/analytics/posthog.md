# PostHog Analytics

Status: active guidance for INT-202 and future analytics changes.

## Current integration

- Provider: `src/components/AnalyticsProvider.tsx`
- Lifecycle hook: `src/hooks/useAnalytics.ts`
- Event registry: `src/services/analytics-events.ts`
- Escape hatch: `src/services/analytics-escape-hatch.ts`
- Growth funnel helper: `src/services/growth-funnel-analytics.ts`
- Coloring property helpers: `src/services/coloring-analytics.ts`
- Privacy disclosure: `src/pages/Privacy.tsx`

## Privacy contract

Organized Glitter uses explicit analytics only. Do not enable autocapture, session recording, or
console-error capture without a separate privacy review.

Allowed properties:

- booleans
- enum/status values already visible in app controls
- counts
- buckets
- route templates
- non-identifying surface names
- durations

Do not capture:

- project, book, page, company, artist, tag, publisher, illustrator, or medium names
- notes, descriptions, URLs, image URLs, file names, or search terms
- auth tokens, reset tokens, email verification tokens, or full URLs containing secrets
- PocketBase record IDs unless there is a separate documented reason
- email addresses, display names, IP-derived fields, or payment details

## Route privacy

Route analytics must call `sanitizeAnalyticsPath()` before capture. The helper removes query
strings and hashes and redacts known auth-token routes.

## Event naming

Use snake_case names in `AnalyticsEvent`. Prefer past-tense product events:

- `project_created`
- `dashboard_search_performed`
- `coloring_page_status_changed`

Do not inline new event strings in components or hooks. Add the name to
`src/services/analytics-events.ts` first.

## Escape hatch

Use `capture()` from `src/services/analytics-escape-hatch.ts` only where React hooks cannot run,
such as global error handlers, route error boundaries, and mutation hooks outside component event
handlers. The escape hatch accepts only registered `AnalyticsEvent` values.

## Pre-React bootstrap failure

When the Vite app never mounts, `AnalyticsProvider` and the escape hatch are unavailable. The
static recovery surface (`#app-error` in `index.html` / `about.html`) still needs a product signal.

Approach:

1. Vite `transformIndexHtml` injects `window.__OG_PUBLIC_ANALYTICS__` with the public
   `VITE_PUBLIC_POSTHOG_KEY` and host (`/glimmer` in production builds; `VITE_PUBLIC_POSTHOG_HOST`
   or `https://us.i.posthog.com` in development). Same public key pattern as the React SDK; no
   private tokens. The config also carries the build identifier as `release`.
2. `public/js/bootstrap-analytics.js` posts `bootstrap_failure_shown` with `navigator.sendBeacon`
   (fallback `fetch` + `keepalive`) to `{host}/e/`.
3. `public/js/loading.js` calls that helper after displaying recovery, with a low-cardinality
   `reason`: `module_resource`, `startup_timeout`, or `runtime_error`.
4. If a real page becomes ready after recovery was displayed, the shell sends
   `bootstrap_recovered` once, with the original failure reason. This covers recovery in the
   same document only. A retry that reloads the page does not emit this event.

Both events include the release, environment (`production`, `preview`, `local`, or `other`),
browser family, route category from a fixed allowlist, online state, service-worker control,
the browser's automation flag, and milliseconds since the bootstrap analytics script started.
The Railway and Spacefast preview hostnames both report `preview`.
These are diagnostic signals, not proof of a network connection or a human visitor.
Diagnostic properties exclude raw user agents, URLs, record IDs, failed filenames, and
exception text. The event's `distinct_id` reuses the stored PostHog identity when available
so startup failures can be correlated with later app activity. For an identified user,
that identity can be their PocketBase user ID. Otherwise, bootstrap events use a separate
anonymous ID stored in the browser.
Do Not Track applies to both events. Rejected fallback requests are handled locally.

Review these events alongside Error Tracking. They are custom events, not `$exception` issues.
Older bootstrap events lack browser and environment context. PostHog's `Automation` label with
`no_user_agent` is not evidence that those failures came from tests. Keep them in failure
reviews until other evidence establishes their source. Distinct analytics identities are not
necessarily distinct people. The payload cannot establish the HTTP status or failed dependency
behind a module resource error.

Do not route this through `analytics-escape-hatch` or `posthog-js`. Keep stacks in `console.error`
only; the recovery UI must not render `#error-details` or raw exception text.

## Coverage map

| Area               | Current coverage                                                                                                                                          | Notes                                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App lifecycle      | `session_context`, `$pageview`, identify/reset, `bootstrap_failure_shown`, `bootstrap_recovered`                                                          | Page paths are sanitized before capture. The static shell captures displayed failures and same-document recovery with the safe diagnostics described above. Both bootstrap events respect DNT. No stacks, full paths, emails, or user text.                                                  |
| API health         | `api_rate_limited`                                                                                                                                        | Captured on PocketBase 429 responses with route bucket, auth state, and consecutive count bucket only. No full URLs, IPs, record IDs, or request bodies.                                                                                                                                     |
| Auth               | `registration_started`, `auth_login_succeeded`, `auth_registration_succeeded`                                                                             | Low-cardinality method/provider/entrypoint only. Device, OS, and browser come from PostHog's automatic event properties. Auth tokens, query strings, hashes, emails, and user-entered names must stay out of captured paths and payloads.                                                    |
| Growth funnel      | `first_project_created`, `first_coloring_book_created`, `first_progress_note_added`, `first_photo_added`, `randomizer_first_spin`, `activation_completed` | First-action events fire once per user, deduped via localStorage in `growth-funnel-analytics.ts`. Payloads carry counts, booleans, and entity/source labels only. Activation fires once a user has created 3 library items and logged at least one progress note, photo, or randomizer spin. |
| Dashboard          | sort, search, filters, status segments, view mode, project open, load timing                                                                              | Search captures length only.                                                                                                                                                                                                                                                                 |
| Overview           | craft filter and sort                                                                                                                                     | No card impression tracking.                                                                                                                                                                                                                                                                 |
| Diamond projects   | create, update, status change, archive, delete, progress note                                                                                             | Payloads avoid names, notes, URLs, images, and record IDs.                                                                                                                                                                                                                                   |
| Options metadata   | company, artist, tag, publisher, illustrator, and coloring medium create/update/delete                                                                    | Names are not captured.                                                                                                                                                                                                                                                                      |
| Randomizer         | spin                                                                                                                                                      | Payload stays low-cardinality.                                                                                                                                                                                                                                                               |
| Import/export      | archive, DAC, bulk photo, and CSV completion events                                                                                                       | Counts, status, duration, file-size buckets, archive schema version, and `settings_data` only. No filenames, record IDs, manifest paths, user-entered names, notes, or URLs.                                                                                                                 |
| Coloring books     | create/update/delete/status, search/sort/filter/view                                                                                                      | Uses low-cardinality helpers.                                                                                                                                                                                                                                                                |
| Coloring pages     | status, photos, mystery reveal, progress notes                                                                                                            | No photo URLs or page subjects.                                                                                                                                                                                                                                                              |
| Profile/settings   | vertical preference updates                                                                                                                               | Theme and account changes are pageview-only unless a product question justifies more.                                                                                                                                                                                                        |
| Public/legal pages | pageviews only                                                                                                                                            | No explicit action events.                                                                                                                                                                                                                                                                   |
| Support page       | `tip_link_clicked`, `support_alternative_clicked`, pageviews of `/support` and `/support/success`                                                         | `amount` is the preset (2, 3, 5, 10) or `custom`; `action` is `feedback` or `app_store_review`. Sent by beacon because each link leaves the page. Stripe owns payment amounts and receipts, so no payment details, emails, or Stripe IDs.                                                    |
| Errors             | `$exception` via app and route error handlers                                                                                                             | Do not include user-entered content in error properties.                                                                                                                                                                                                                                     |

## Adding or changing events

1. Decide what product question the event answers.
2. Add or reuse an `AnalyticsEvent` constant.
3. Normalize properties through a helper when values come from user records.
4. Capture only after successful user actions or committed mutations.
5. Add or update a focused test for redaction, bucketing, or event payload shape.
6. Update this coverage map.

## Import And Export Events

Import/export telemetry is intentionally narrow because uploaded files and archives can contain
user-entered names, filenames, notes, URLs, and record references. Use
`src/features/import-export/importExportTelemetry.ts` for event and exception payloads.

Current import/export events:

- `archive_export_started`
- `archive_export_completed`
- `archive_import_started`
- `archive_import_completed`
- `bulk_photo_import_started`
- `bulk_photo_import_completed`
- `dac_import_previewed`
- `dac_import_completed`
- `csv_export_completed`
- `import_completed`, for legacy Organized Glitter CSV import only

Allowed import/export properties:

- `source`: `archive`, `dac_csv`, `organized_csv`, or `bulk_photos`
- `status`: `success`, `partial`, or `failed`
- `records`, `warnings`, `errors`, `skipped`, and `imported_photos`
- `duration_ms`
- `file_size_bucket`
- `archive_schema_version`
- `surface: settings_data`

Exception captures replace the local error with a fixed `ImportExportError` and
`Import/export operation failed` message before calling `captureException`. The original
error stays in the import/export flow for local handling and is never sent with its
message or stack. Captured properties are limited to:

- `$exception_source`
- `operation`
- `archive_schema_version`, only for supported versions 1, 2, or 3
- `status`
- `failed_count_bucket`
- `warning_count_bucket`
- `impact: cache_refresh`, for non-fatal cache refresh failures
- `surface: settings_data`
- `suspected_external_script` and fixed `error_origin`, classified locally from
  the original error without forwarding its message or stack

Never add filenames, project/book/page/company/artist/tag/publisher/illustrator/medium names,
PocketBase record IDs, notes, URLs, image URLs, manifest paths, or raw error messages to
import/export analytics properties. Non-Error object payloads must not be serialized into
exception messages or properties.

## Auth and device questions

Use `auth_login_succeeded` for questions about successful sign-ins by platform.
The event intentionally records only:

- `auth_method`: `password` or `oauth`
- `auth_provider`: `email`, `apple`, `google`, or `discord`
- `auth_entrypoint`: `login` or `register`

Break the event down by PostHog's automatic `$device_type`, `$os`, `$browser`,
or `$device` properties to understand where signed-in users are coming from. Do
not add user emails, usernames, PocketBase IDs, provider account IDs, raw URLs,
or auth errors to the event payload.

Use `auth_registration_succeeded` for successful email/password account creation.
OAuth buttons on the Register page still emit `auth_login_succeeded` with
`auth_entrypoint: register` because PocketBase may be signing in an existing
OAuth account rather than creating a new one.

## Growth funnel events

These events track how new users sign up and reach their first real use of the app, without
recording anything they type. Call `trackGrowthFunnelMilestone()` from
`src/services/growth-funnel-analytics.ts` after a successful write to record a first-action
milestone. Pass its `activationSignal` option when the write also contributes to activation.

Each milestone fires at most once per user:

- `registration_started`: signup begins on the register page, via password or OAuth.
- `auth_registration_succeeded`: a password account is created.
- `first_project_created`: their first diamond project.
- `first_coloring_book_created`: their first coloring book.
- `first_progress_note_added`: their first progress note, on a diamond or coloring project.
- `first_photo_added`: their first progress-note image or coloring page photo.
- `randomizer_first_spin`: their first randomizer spin.
- `activation_completed`: they've created 3 library items and logged at least one progress note,
  photo, or randomizer spin.

To do this the helper keeps a little state in localStorage: which events have already fired, the
created-item count, and whether the user has added a progress note, a photo, or used the
randomizer.

Never put titles, notes, names, URLs, filenames, emails, PocketBase record IDs, or any free text
into that state or into funnel event properties.

## Local verification

Analytics is disabled when `VITE_PUBLIC_POSTHOG_KEY` is not set. For local manual testing, use a
development PostHog project key and host:

```bash
VITE_PUBLIC_POSTHOG_KEY=<dev key> \
VITE_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com \
pnpm dev:local
```

Use browser devtools network filtering for `/glimmer`, `posthog`, or `e/`. Do not commit real
PostHog keys.

## SDK configuration notes

`src/components/AnalyticsProvider.tsx` keeps the SDK explicit and privacy-first:

- `capture_pageview: false` and `capture_pageleave: false`, because React Router pageviews are
  handled manually.
- `autocapture: false`, `disable_session_recording: true`, and `disable_surveys: true`.
- `capture_exceptions` is not enabled for automatic exception capture. Use manual
  `captureException()` calls with redacted properties.
- `respect_dnt: true`.
- `advanced_disable_flags: true` and `advanced_disable_feature_flags: true`, because this app does
  not currently use PostHog feature flags.
- `mask_all_element_attributes: true`, `mask_all_text: true`, and
  `mask_personal_data_properties: true` as defensive privacy defaults.

## Source Maps

PostHog error tracking uses uploaded source maps for readable production stack traces. Production
builds emit hidden Vite source maps, so bundles do not link to `.map` files. After `vite build`,
`scripts/upload-sourcemaps.mjs` runs automatically from `pnpm build` and
`pnpm build:with-sitemap`.

The uploader:

- injects PostHog chunk IDs and uploads source maps when both the CLI token and project ID are present
- ties uploads to the build release from `GITHUB_SHA`, `RAILWAY_GIT_COMMIT_SHA`, or
  `VITE_APP_VERSION`
- deletes local `.map` files whether upload succeeds, fails, or is skipped, so source maps do not
  ship from `dist`
- treats upload failure as non-fatal diagnostics and allows the app deploy to continue

Required optional secrets for uploads:

- `POSTHOG_CLI_TOKEN` or `POSTHOG_CLI_API_KEY`
- `POSTHOG_CLI_PROJECT_ID` or `POSTHOG_CLI_ENV_ID`
- `POSTHOG_CLI_HOST`, optional, defaults to the PostHog CLI host

## SDK maintenance

Keep `posthog-js`, `@posthog/react`, and `@posthog/cli` current together. The
first two are the browser runtime and React integration; the CLI is used only
for production source-map uploads. Routine upgrades must preserve the privacy
configuration above and the existing first-party `/glimmer` proxy.

The app explicitly disables PostHog's automatic pageviews, page-leave events,
autocapture, exception capture, session recording, and surveys. Recheck those
options against the upgraded browser SDK defaults so new automatic collection
does not bypass the app's explicit instrumentation and consent behavior.

Before deploying a CLI upgrade, run the installed binary's help commands and
confirm the uploader's contract is still supported:

```bash
pnpm exec posthog-cli sourcemap inject --help
pnpm exec posthog-cli sourcemap upload --help
```

The test suite executes the installed CLI's help commands and asserts the
required flags, so incompatible CLI upgrades fail CI. The uploader requires
`sourcemap inject --directory` and `sourcemap upload --directory --release-name
--release-version --delete-after`. After a
credentials-present production build, confirm the matching symbol set appears
in PostHog and inspect a deployed JavaScript bundle for its injected
`//# chunkId=...` marker. The upload remains non-fatal so diagnostics cannot
block an application deployment.

After each production upgrade, verify the deployed traffic reports the new
`properties.$lib_version` value and that older versions are declining in the
[PostHog SDK Health page](https://us.posthog.com/project/166350/health). The
health check may remain active briefly while cached browser bundles age out.

Dependabot groups these three packages into one weekly update so compatibility
and source-map behavior are reviewed together. The repository's
`minimumReleaseAge` policy still applies to automated updates.
