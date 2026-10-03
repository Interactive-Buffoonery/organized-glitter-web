# ADR-0013: Gate PRs on typecheck, lint, unit tests, and accessibility checks

Date: 2026-06-12 (records a bar raised incrementally; written down during the
2026-06 ADR backfill)

## Status

Accepted. Gate implementation refreshed on 2026-09-06.

## Context

A solo-maintained app cannot rely on reviewer count to catch regressions; the
pre-PR gate has to do that work. Accessibility in particular tends to decay
silently, and building accessibly is a personal commitment for this project,
independent of audience analysis or compliance pressure.

## Decision

The required pre-PR gate is `pnpm test:pr`: static checks (including typecheck,
formatting, lint, boundaries, and workflows), React Doctor, PocketBase schema and
upgrade validation, the full Vitest suite, and production browser smoke with
blocking public and authenticated accessibility checks. Browser tests use
disposable PocketBase data and include mobile WebKit. `pnpm pr:create` runs the
gate before opening a PR. Local commands and Actions share the same checks; see
[the CI contract](../agents/ci.md).

Testing stack and rules:

- **Vitest + Testing Library** for unit and component tests, colocated under
  `src/`; deterministic runs (`isolate: true`, no retries); queries by role or
  label before test IDs.
- **Playwright** for e2e, including dedicated a11y specs and screen-review
  flows; guidance in `docs/testing-playwright.md`.
- Bug fixes and shared-behavior changes require focused regression tests.

Accessibility checks are a first-class, blocking part of the gate, not an
optional audit.

## Rejected Alternatives

### A11y as periodic audit instead of a gate

Audits find decay after it ships. The axe checks are cheap enough to run every
PR, and the commitment is that inaccessible UI is a defect, not a backlog item.

### Full e2e suite as the PR gate

Running the whole Playwright matrix per PR would be too slow for solo
iteration; the gate runs a focused browser and a11y subset. Broader Chromium
and WebKit suites run for release PRs, on a schedule, and on manual dispatch.

## Consequences

- Every PR pays the gate cost (minutes), which buys regression and a11y
  coverage no reviewer headcount provides.
- Axe-based checks catch mechanical issues (labels, contrast, roles); they do
  not replace manual checks for flow-level accessibility, which stay part of UI
  review (`AGENTS.md` checklist).
- Mobile Safari behavior is an explicit review concern for forms, uploads, and
  PWA changes, since automated coverage there is thinner.
