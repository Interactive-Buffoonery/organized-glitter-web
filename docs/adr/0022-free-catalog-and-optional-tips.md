# ADR-0022: Keep the catalog free and launch optional tips first

Date: 2026-09-27

## Status

Accepted. Supersedes [ADR-0021](./0021-diamond-catalog-supporter-and-tips.md).

## Context

ADR-0021 planned a free monthly catalog allowance and a paid Supporter
subscription. That would make a useful way to enter a project depend on a
purchase. The agreed direction is to keep ordinary tracking and the catalog
free, and offer a separate way to support development.

## Decision

Everyday tracking, manual entry, and existing project work remain free. The
diamond-painting catalog will be free to search, scan, and import from, with no
monthly add limit. Start with a small curated catalog. Later, people may choose
to submit kit facts for review, free of charge. Nothing becomes public until a
reviewer accepts it. Catalog coverage and data sources still need validation.

Shared kit metadata and private projects are separate. Adding a kit to a stash
does not publish the user's project, notes, photos, or other private data.
Catalog corrections do not silently overwrite edits in a private project.

Start native support with optional, repeatable one-time "Support Organized
Glitter" tips through Apple in-app purchases and RevenueCat. Tips grant no feature
entitlements and promise no future paid access. A purchase, refund, or analytics
failure cannot change access to tracking or the catalog. RevenueCat provides
purchase reporting and a path for possible permanent unlocks later. It also
adds a vendor, SDK data collection, and privacy work compared with direct
StoreKit. Future unlocks are not part of this decision.

PocketBase remains the application backend and identity system. Backend
contracts belong in this repository; the native app consumes verified
contracts. Use privacy-conscious PostHog analytics to understand catalog and
tip outcomes, independently of purchase processing and feature access.

Coloring-book ISBN lookup and a possible one-time alternate-icon/book-lookup
pack remain research only. About $5 was an idea, not an agreed price or a
product promise. Tip amounts, catalog data sources, and launch dates remain
open.

## Rejected Alternatives

- The five-add monthly allowance and paid diamond-catalog subscription in
  ADR-0021 are no longer in the active plan.
- Contribution credits, credit balances, and rewards for submitting kit facts
  are not part of the catalog plan. Contributions are voluntary and reviewed.

## Consequences

The catalog needs a curated seed set, clear permission to use its data, and a
review path before public contributions can appear. Free catalog access has no
billing dependency. Tips need separate store setup, privacy controls, and
release validation. Neither tips nor PostHog decide what a user may do.

[INT-1147](https://linear.app/interactive-buffoonery/issue/INT-1147) records this
decision. Follow-up work lives in Linear:

- Catalog research and contracts: [INT-1163](https://linear.app/interactive-buffoonery/issue/INT-1163), [INT-1164](https://linear.app/interactive-buffoonery/issue/INT-1164), and [INT-1165](https://linear.app/interactive-buffoonery/issue/INT-1165).
- Catalog seed and clients: [INT-1166](https://linear.app/interactive-buffoonery/issue/INT-1166), [INT-1167](https://linear.app/interactive-buffoonery/issue/INT-1167), and [INT-1168](https://linear.app/interactive-buffoonery/issue/INT-1168).
- Tips and purchase flow: [INT-1154](https://linear.app/interactive-buffoonery/issue/INT-1154), [INT-1156](https://linear.app/interactive-buffoonery/issue/INT-1156), and [INT-1161](https://linear.app/interactive-buffoonery/issue/INT-1161).
- SDK privacy and analytics: [INT-1155](https://linear.app/interactive-buffoonery/issue/INT-1155), [INT-1157](https://linear.app/interactive-buffoonery/issue/INT-1157), and [INT-1158](https://linear.app/interactive-buffoonery/issue/INT-1158).
