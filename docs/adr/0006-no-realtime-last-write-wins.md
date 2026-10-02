# ADR-0006: Ship without realtime; accept online-only writes and last-write-wins

Date: 2026-06-12 (policy set 2026-05-16 as `docs/REALTIME_POLICY.md`; folded
into this ADR during the 2026-06 ADR backfill)

## Status

Accepted, with the concurrent full-form edit exception in INT-1084. Supersedes
`docs/REALTIME_POLICY.md` (retired).

## Context

PocketBase offers realtime subscriptions, and a future mobile client raised the
question of cross-client freshness and concurrent edits. Realtime improves
freshness, but it does not merge edits, prevent overwrites, or replace conflict
control. For a single user editing their own craft data, concurrent-edit
conflicts are rare and low-stakes.

## Decision

The app ships without realtime subscriptions:

- The PWA uses React Query polling, invalidation, cache expiry, and
  refetch-on-focus (ADR-0004). A future mobile client may start with
  pull-to-refresh.
- Online-only writes are the model. Offline queued writes are out of scope.
- Last-write-wins is accepted for writes without an expected revision. Project
  and coloring book web edit forms send an expected revision and receive a
  conflict response if either record changed since the form opened.
- React Query mutations do not automatically retry failed writes. A lost
  response can follow a committed write, and replaying it could overwrite a
  newer change from another client.

In practice: a save on one client writes to PocketBase normally; another client
may show stale cached data until refetch, focus, or cache expiry. An opted-in
project or coloring book form rejects a stale save and keeps its unsaved values
for an explicit user decision. Older clients can still write without a
precondition. No UI may claim realtime sync or offline conflict merging exists.

## Realtime gate (if this is ever revisited)

Realtime may be added selectively only after `docs/RULE_AUDIT.md` marks the
collection realtime-safe for current-user data.

Allowed future realtime candidates: `projects`, `progress_notes`,
`coloring_books`, `coloring_pages`, `coloring_page_progress_notes`,
`user_dashboard_settings`.

Defer or avoid realtime for stats route data, large archive or completed lists,
and bulk metadata lists unless profiling shows a concrete UX benefit.

## Conflict detection for project and coloring book forms

INT-1084 adds a numeric `revision` to projects and coloring books. Every normal
create starts at zero, and record saves increment it, including saves from
clients that do not send a precondition. Direct project-tag and coloring-book-tag
join writes also increment their affected parent revisions. The opted-in edit
forms send the revision loaded when they opened. PocketBase compares it to a
fresh record and writes inside one transaction, returning HTTP 409 on a
mismatch. Changed tag selections are synchronized in that same transaction;
unchanged selections are omitted. Derived sort-proxy SQL maintenance does not
increment revision because it does not change form-owned fields. A conflict
never automatically replays a write. The user can inspect the latest record,
then explicitly keep their unsaved values and save again. The revision is
necessary because the PocketBase `updated` field has millisecond precision and
cannot reliably distinguish near-simultaneous writes.

## Rejected Alternatives

### Realtime subscriptions everywhere

Adds connection management and PocketBase rule-safety requirements for a
freshness improvement most single-user flows do not need, and it would still
not solve conflicts.

### Offline-first with queued writes

A large engineering investment (queue, replay, merge UI) for a tracker whose
users are overwhelmingly online when they update progress.

## Consequences

- Cross-device staleness windows exist and are accepted; validation is that a
  save on one client appears on another after refresh or focus.
- Two near-simultaneous writes to opted-in full forms yield one committed save
  and one conflict. Header-free clients retain last-write-wins behavior.
- The React Query cache configuration is the freshness mechanism, so cache and
  invalidation changes carry policy weight.
- Adding realtime to any collection requires the rule audit gate above plus a
  new ADR.
