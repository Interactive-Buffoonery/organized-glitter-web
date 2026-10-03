# ADR-0017: Land changes through feature branches to dev, release dev to main

Date: 2026-06-12 (records repo policy in place since branch protection was set
up; written down during the 2026-06 ADR backfill)

## Status

Accepted

## Context

A solo project still benefits from a release boundary: somewhere to soak
changes against the real backend before users see them, and a PR record for
every change (including agent-authored ones). Hosting reinforces this: Railway
runs a persistent preview environment from `dev` and production from `main`
(ADR-0008).

## Decision

All changes land through PRs:

- Feature branches target `dev`; branch names include the Linear issue ID when
  possible (`int-123-short-desc`).
- Releases are PRs merging `dev` into `main`.
- The pre-PR gate (ADR-0013) runs before PRs open; `pnpm pr:create` bundles
  gate plus `gh pr create`.
- `main` is protected; details and GitHub limitations are in
  `docs/agents/main-branch-protection.md`.

Because `dev` deploys to the preview environment against the production
PocketBase (ADR-0009), the preview is a true rehearsal of a release.

## Rejected Alternatives

### Trunk-based development on main

Simpler, but loses the soak window and makes every merge a production deploy;
with one production database behind both environments, the staged branch is
the safety margin.

### Long-lived release branches per version

Versioned release branches are process overhead a continuously deployed hobby
product does not need; `dev` to `main` is the entire release train.

## Consequences

- `dev` and `main` can drift; release PRs are the reconciliation point and can
  be large if releases are infrequent.
- Preview testing exercises production data; destructive testing belongs on
  local PocketBase, never preview (see `docs/pocketbase/local-development.md`).
- Every change has a PR trail, which is the review record for agent-assisted
  work.
