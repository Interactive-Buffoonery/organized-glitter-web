# ADR-0005: Route all PocketBase access through a typed service layer

Date: 2026-06-12 (records a decision hardened over several refactors; written
down during the 2026-06 ADR backfill)

## Status

Accepted

## Context

The PocketBase SDK is easy to call from anywhere, which is exactly the problem:
raw `pb` calls in leaf components scatter query shaping, error handling, and
collection knowledge across the UI, and make a future backend change (or a
shared mobile data layer) much harder. The codebase needed one sanctioned path
from UI to PocketBase.

## Decision

PocketBase access is layered, and the layering is enforced:

- `src/lib/pocketbase.ts` owns the client singleton `pb`.
- `src/services/pocketbase/` is the only place allowed to use `pb` directly:
  collection access, query shaping, and mutations.
- `src/hooks/queries/` and `src/hooks/mutations/` wrap services in React Query
  (ADR-0004); components consume hooks, never services or `pb` directly where
  avoidable.
- `src/schemas/` owns Zod validation shapes.
- `src/types/pocketbase.types.ts` is generated from the live schema via
  `pocketbase-typegen` and committed; regeneration is explicit (`pnpm pb:types`).

The boundary is enforced by `pnpm lint:pb-boundary`
(`scripts/check-pb-boundary.sh`), which fails when files outside
`src/services/` import the raw `pb` client. Genuine exceptions opt out with a
`// pb-boundary-ignore` comment.

## Rejected Alternatives

### SDK calls wherever convenient

Rejected after living with it: drift was constant, and the boundary had to be
recovered by refactor. The lint script exists because convention alone did not
hold.

### A full repository/adapter abstraction over PocketBase

A backend-agnostic abstraction layer would cost more than it returns while
PocketBase is the committed platform (ADR-0001). The service layer is the
designated seam if that ever changes.

## Consequences

- Backend knowledge concentrates in `src/services/pocketbase/`, which is the
  single seam for a future platform change or a shared mobile data package.
- New data features have a fixed shape: service, then hook, then component,
  with Zod schemas for validation and generated types for records.
- The boundary check runs in lint; violations are build-time failures, not
  review nitpicks.
- Type generation is explicit, so schema changes require regenerating committed
  types as part of the change (see `docs/pocketbase-typegen.md`).
