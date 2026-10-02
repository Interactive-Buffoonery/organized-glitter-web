# ADR-0001: Stay on PocketBase for backend and data

Date: 2026-05-08

## Status

Accepted

## Context

Organized Glitter needs authenticated multi-user storage, relational-ish records, file uploads, and a small server surface without running a large dedicated backend team or paying for managed Postgres, containers, and glue services at hobby-to-early-product scale.

Alternative directions include a separate custom API plus managed database, BaaS vendors with different pricing curves, or splitting read/write paths across multiple services.

## Decision

The product **stays on PocketBase** as the primary backend: SQLite-backed collections, built-in auth and file storage, dashboard-managed schema, and committed migrations under `pb_migrations/`, with optional JS hooks under `pb_hooks/` and server route handlers only where the browser must not hold secrets.

### 2026-06-23 reaffirmation

The Convex beta/staging migration plan is retired. Do not treat `beta/convex-migration`,
`codex/convex-phase-0`, `beta.organizedglitter.app`, Clerk auth wiring, or Convex
R2 exploration as active product direction unless a new ADR explicitly reopens the
backend migration.

## Consequences

- **Cost and ops:** Predictable low fixed cost for a single PocketBase deploy suitable for current scale; fewer moving parts than a self-managed API plus database stack.
- **Coupling:** The web app talks to PocketBase directly via the SDK from `src/lib/pocketbase.ts` and `src/services/pocketbase/`; major platform changes require a deliberate migration project, not a gradual side-by-side swap.
- **Scale and query model:** SQLite and PocketBase query patterns define how far vertical scaling and schema design can go; hot paths that outgrow this model need explicit redesign or auxiliary services, captured in new ADRs or audits rather than silent drift.
- **Documentation:** Schema and local dev expectations stay documented under [`../pocketbase/`](../pocketbase/) and [`../pocketbase-typegen.md`](../pocketbase-typegen.md); type generation and migration workflow remain first-class repo concerns.
