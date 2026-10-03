# ADR-0015: Use PostHog for analytics, behind a first-party proxy

Date: 2026-06-12 (records an integration in place before the Railway move;
written down during the 2026-06 ADR backfill)

## Status

Accepted

## Context

The product needs usage insight (which features earn their maintenance cost),
error visibility, and eventually flags/experiments, without stitching together
multiple vendors. Ad blockers routinely drop third-party analytics hosts,
which silently biases data.

## Decision

PostHog is the analytics platform, chosen for feature depth: product
analytics, session replay, feature flags, experiments, and error tracking in
one tool with a generous free tier.

Client events go through a first-party proxy: the Spacefast Function forwards
`/glimmer/*` to PostHog. The proxy is deliberately best-effort; if the
upstream fetch fails, it returns `204 No Content` rather than treating
analytics egress as an app failure.

Event coverage, privacy rules, and maintenance guidance live in
`docs/analytics/posthog.md`.

## Rejected Alternatives

### Lightweight page analytics (Plausible, Fathom)

Privacy-friendly and simple, but no replay, flags, experiments, or error
tracking; the product questions here are feature-level, not traffic-level.

### Google Analytics

Wrong data posture for a personal-data product, heavily ad-block-filtered, and
no product-analytics depth.

## Consequences

- One vendor accumulates significant behavioral data; the privacy rules in
  `docs/analytics/posthog.md` (no PII in events) are load-bearing.
- The proxy keeps capture working under ad blockers but makes the Spacefast
  Function part of the analytics path; its best-effort failure mode is
  intentional and must be preserved.
- Feature flags and experiments are available without new infrastructure when
  wanted.
- Analytics keys are optional Vite variables; the app must function fully with
  analytics disabled.
