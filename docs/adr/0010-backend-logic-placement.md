# ADR-0010: Place backend logic in pb_hooks, api/ routes, or the Railway server by rule

Date: 2026-06-12 (records conventions formed as each surface appeared; written
down during the 2026-06 ADR backfill)

## Status

Superseded for new web routes by the Spacefast cutover on 2026-09-27. The
placement rules below describe the former Railway runtime. The remaining
`api/send-feedback.js` handler runs only in the local build server; current
feedback uses PocketBase.

The former `server/railway-server.js` is now
[`server/local-build-server.js`](../../server/local-build-server.js) for local tests.

## Context

The product is mostly client plus PocketBase, but some logic cannot or should
not run in the browser: server-computed stats, schema-adjacent maintenance,
and anything holding a secret (email API keys, future AI keys). The repo has
three server-side surfaces and needs a rule for which logic goes where, so the
server footprint stays minimal instead of accreting.

## Decision

Backend logic is placed by what it needs:

- **`pb_hooks/` (PocketBase JSVM hooks):** logic that belongs next to the data,
  runs inside PocketBase, and needs no external secrets. Examples: stats
  aggregation (`stats.pb.js`), coloring helpers, dashboard settings, sort proxy
  sync, index creation. Treat it as backend code, not Vite code; it has JSVM
  quirks (byte-array JSON reads, `new BadRequestError`) and should be verified
  against local PocketBase before deploying.

  The authenticated feedback endpoint is a narrow exception: it shares one
  session-aware API between web and iOS and sends through PocketBase's configured
  mail client. See ADR-0016's 2026-09-25 update.

- **`api/` route handlers:** small HTTP endpoints that must hold server-side
  secrets, mounted by the Railway server. The existing `send-feedback.js` route
  uses a Resend key but is legacy; current app feedback uses PocketBase
  (ADR-0016).
- **`server/railway-server.js`:** serving, headers, SPA fallback, and the
  PostHog proxy; it mounts `api/` handlers but should not grow business logic.

Hard rules: secrets and server-only keys never reach client code, and `openai`
must not be imported in client code (ESLint enforces this).

## Rejected Alternatives

### A general-purpose backend service

A dedicated API service would recreate the backend team problem ADR-0001
avoids. The current surfaces cover data-adjacent logic and secret-holding
routes without one.

### Everything in pb_hooks

JSVM hooks cannot comfortably hold third-party SDK integrations or secrets
managed outside PocketBase, and they couple unrelated concerns to database
deploys.

## Consequences

- Server-only secrets stay on the server. Use `api/` for Railway-managed keys;
  use `pb_hooks/` for PocketBase data and its configured mail client.
- `pb_hooks/` and `pb_migrations/` deploy with PocketBase (PikaPods, ADR-0009)
  while `api/` and the server deploy with Railway (ADR-0008); a feature
  spanning both needs coordinated deploys.
- Each surface stays small enough to test directly (`api/*.test.js`,
  `server/railway-server.test.js`).
- New server-side capability (for example AI features) defaults to an `api/`
  route holding the key, never a client call.
