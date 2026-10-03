# ADR-0004: Use React Query for server state, keep client state minimal

Date: 2026-06-12 (records a long-standing decision; written down during the
2026-06 ADR backfill)

## Status

Accepted

## Context

Almost all interesting state in Organized Glitter is server state: projects,
coloring books, pages, notes, stats, and user settings stored in PocketBase.
The app needs caching, invalidation, optimistic updates, and refetch-on-focus
behavior without hand-rolled fetch/loading/error plumbing in every component.

## Decision

TanStack React Query owns all server state. Queries live under
`src/hooks/queries/`, mutations under `src/hooks/mutations/`, with domain
splits such as `src/hooks/coloring/`. Mutation side effects (invalidation,
optimistic updates) are owned by the mutation hooks, not by calling components.

Client-only state stays as local component state or context. Zustand is allowed
only for the rare cross-cutting UI state that context or hooks cannot serve
cleanly (currently a single feedback-dialog store). There is no global client
state container.

## Rejected Alternatives

### Redux or a broad global store

A global store would duplicate what React Query's cache already provides for
server data, and the remaining client-only state is too small to justify the
ceremony.

### Hand-rolled fetching in components

Direct fetch-in-component patterns lose shared caching, deduplication, and
consistent stale/refetch behavior, which the realtime policy (ADR-0006) relies
on for cross-client freshness.

## Consequences

- Freshness across devices comes from React Query polling, invalidation, cache
  expiry, and refetch-on-focus; this is the foundation the no-realtime policy
  (ADR-0006) stands on.
- Every React Query change must consider invalidation, optimistic updates,
  stale state, and mutation side-effect ownership (review checklist in
  `AGENTS.md`).
- Query keys are part of the app's contract; key changes need the same care as
  schema changes.
- Adding a second Zustand store should be a deliberate exception, not a
  default.
