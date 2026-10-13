# Web analytics build context

Ordinary registered web events, including `$pageview` and account-auth events, and manual
`$exception` events receive
context centrally in `AnalyticsProvider.before_send` after the existing consent gate and
URL/path sanitizer. Hook, escape-hatch, and account-service captures share this path.
No new events, user properties, browser reads, or telemetry sources are added.

## Public metadata allowlist

| Property      | Contract                                                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `platform`    | Always `web` in this web repository.                                                                                             |
| `environment` | Exact `production`, `preview`, `local`, or `other`.                                                                              |
| `release`     | Existing `__APP_BUILD_ID__`, when it is a real public identifier with 1-80 ASCII letters, digits, dots, underscores, or hyphens. |

The existing Vite build identifier selects `GITHUB_SHA`, then `RAILWAY_GIT_COMMIT_SHA`,
then `VITE_APP_VERSION` for production-mode builds. `release` is the same public build
identity used by exception context and sourcemap releases; a commit SHA does not need
a second property. Never put branch URLs, account data, credentials, or private text
in these build inputs. Character validation is a bound, not a secret detector.

`dev-build` and `local-build` are existing generic build placeholders, not releases.
They and absent or invalid identifiers are omitted. Do not invent a release or SHA.
The existing production build guard still requires a build identifier; analytics adds
no build failure or fabricated fallback when context is unavailable.

Set `VITE_DEPLOYMENT_ENVIRONMENT` explicitly in deployment build configuration:
`production` for production and `preview` for preview artifacts. Vite production
mode describes bundling and does not establish the deployment environment. An absent,
empty, or invalid value is `other` for a built artifact. Only an unconfigured Vite
development server defaults to `local`; invalid configured values still become `other`.
Case changes and surrounding whitespace are invalid. Hostnames are not collected or
used to infer this ordinary-event context.

Release must be a public label. Missing `release` or `environment=other` signals a
configuration gap to investigate, not production traffic or a known deployed version.
Deployment owners must supply the explicit environment and real build identifier.
This PR does not change deployment configuration or live PostHog settings.

These three keys are reserved centrally. Persisted SDK super-properties and callers
cannot override platform, environment, or the validated current release; an old release
is removed when the current build has none. Event names and all other event-specific
properties retain their meaning and continue through the existing privacy sanitizer.
The context helper enriches names in `AnalyticsEvent` except bootstrap events, plus `$exception`.
It does not enrich unknown names, identity/person events, or autocapture events. Bootstrap
diagnostics retain their separate shell context contract. Exception payload redaction remains
required before the shared build context is applied.

Consent readiness, account opt-out and DNT remain required. Session replay, autocapture,
and automatic exception capture remain disabled. The context allowlist does not grant
permission to collect additional event payloads or arbitrary strings.

## Web and native naming contract

Use the same snake_case event name across web and native only when the trigger and
successful outcome mean the same thing. Platform describes the emitting client, not
the craft, feature surface, social destination, or device type. `environment` describes
the deployment, and `release` identifies the emitting build. Consumers must handle
older events without these dimensions and must not treat absent platform as native.

Native PR 61 (`Interactive-Buffoonery/organized-glitter-app`) owns native coverage and
privacy filtering separately. Its reviewed source at `85533f3` uses `platform=ios`,
`environment=production|preview`, and `app_version` from `CFBundleShortVersionString`.
Web `release` is a build identifier and native `app_version` is a marketing version;
do not combine them as equivalent releases or rename either field in this web change.
Any future native release/SHA alignment belongs in a separate native contract change.

Native local saves and accepted synchronization are different milestones; do not
equate a local save with a successful web server write. Platform-specific triggers
should retain their distinct names until meanings align.

No schema version is added: this is additive context, not a change to event meaning,
property types, or trigger timing. Add a version only with a documented incompatible
contract and a consumer migration plan.

## Scope and validation

Exception redaction remains the responsibility of the manual exception helpers. The shared
context helper adds only validated build dimensions, without changing exception content.
Dashboard specs, tag creation, reporting definitions, and native instrumentation retain their
separate contracts. See [PostHog analytics](posthog.md) for event filtering and consent rules.

Unit tests cover the full ordinary event registry, bounds and privacy of build inputs,
preview/missing environment behavior, stale SDK values, exception enrichment, and identity
and bootstrap exclusions.
Provider tests exercise real SDK results for lifecycle, escape-hatch, and account-service
events, together with account opt-out, DNT, and existing route privacy.
