# ADR-0022: Keep the app free with website-only support

Date: 2026-09-27; updated 2026-10-05

## Status

Accepted. Replaces ADR-0021 and the earlier native support plan.

## Context

Organized Glitter should be useful without a payment requirement. Voluntary
website support can help cover hosting without changing what users can do.

## Decision

All app features are free, including tracking, manual entry, import/export,
and planned diamond-catalog search, scanning, imports, and contributions.
Catalog imports have no monthly allowance. Start with curated kit metadata;
accept voluntary submissions only after review and source-rights validation.

Shared kit metadata and private projects remain separate. Adding a kit does
not publish a user's project, notes, or photos. Catalog corrections do not
silently overwrite private edits.

Accept voluntary support only on the website. It grants no app features,
content, credits, or account privileges. The native app contains no payment
processing, contribution prompts, or checkout links. Website support does
not require a native account or synchronize payment status into the app.

PocketBase remains the application backend and identity system. Analytics
must follow the existing privacy rules and cannot determine feature access.
ISBN lookup and alternate icons remain research for potential free features.
Catalog data sources, coverage, and launch dates still require validation.

## Consequences

Catalog work needs a curated seed set, permission to use its data, and a
review path before public contributions appear. Website support is independent
of app release and catalog access. Existing analytics, account isolation,
and deletion requirements remain in force.

[INT-1147](https://linear.app/interactive-buffoonery/issue/INT-1147) records the
product direction; [INT-1178](https://linear.app/interactive-buffoonery/issue/INT-1178)
tracks website support. Catalog and analytics implementation remain separate
workstreams in Linear.
