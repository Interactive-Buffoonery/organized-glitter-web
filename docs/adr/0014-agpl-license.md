# ADR-0014: License the project AGPL-3.0-or-later

Date: 2026-06-12 (records the license chosen at project start; written down
during the 2026-06 ADR backfill)

## Status

Accepted

## Context

The repository is public and the app is a hosted product
(organizedglitter.app). A permissive license would allow someone to take the
code, run a modified hosted version commercially, and share nothing back. The
network-use loophole in ordinary GPL makes it insufficient for a web app.

## Decision

The project is licensed AGPL-3.0-or-later. Anyone who runs a modified version
as a network service must offer the corresponding source to its users. This
protects against closed-source SaaS forks while keeping the project genuinely
open source.

## Rejected Alternatives

### MIT/Apache-2.0

Maximizes adoption but permits exactly the closed hosted fork the license is
meant to prevent.

### Source-available licenses (BSL, fair-source)

Stronger commercial protection, but not open source, and heavier than a
hobby-scale product warrants.

## Consequences

- Closed-source hosted forks are non-compliant; forks must publish their
  changes.
- Dependencies must remain license-compatible (the app's dependencies are
  permissively licensed, which is fine in this direction).
- External contributions arrive under AGPL terms; relicensing later would
  require agreement from all contributors, so the choice is sticky.
- The `NOTICE` file and `package.json` `license` field carry the declaration.
