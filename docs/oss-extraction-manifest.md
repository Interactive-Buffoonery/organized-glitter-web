# Organized Glitter public extraction manifest

Status: public extraction merged, 2026-10-03. Public extraction PR #1 merged into
`main` on 2026-10-03, including publication safeguards from PR #2, review fixes
from PR #10, and publication evidence from PR #11. The repository is public and
`main` is the default branch. Follow-up application and validation changes target
`dev`; release PRs merge `dev` into `main`.

The active publication security ruleset requires both `Publication security` and
`CI result` from GitHub Actions on `main`, `dev`, and
`bootstrap/public-extraction`, with up-to-date branches and no bypass actors.
See [branch protection](agents/main-branch-protection.md). A merged extraction
does not complete the remaining validation or production cutover gates below.
The extraction and ruleset updates perform no deployment, domain change, or
production data migration.

## Source and scope

The original public extraction used private source commit
`647ecd9bdbdfffa37c693e914f06a3ba39fead41`. The restored website files use tracked
source from `dev` commit `36cc6b3b657cac8680ad4f6924601f7d5b965b0e`.
Newsletter templates come from the MailPoet documentation branch; their per-file
provenance is recorded in the extraction inventory.

Sarah's confirmed scope is to preserve the entire website and configure official
services in ops. This supersedes the earlier tracker-only plan and its exclusions
of Astro, blog navigation, contact/newsletter pages, and blog QA. Branding and
approved website content remain. No native SwiftUI application code is copied.

The public repository becomes the canonical web and PocketBase source. Ops must
consume an immutable public revision and keep credentials outside Git. The
private repository can remain a frozen historical archive after a separately
approved cutover. See [the deployment boundary](./official-deployment.md).

Copy tracked files from pinned revisions. Do not copy an unrestricted working
directory. Fresh public history does not transfer private commits or tags.
Runtime databases, backups, user uploads, authentication state, environment files,
private Apple configuration, internal operations history, and private agent
configuration remain excluded. The [inventory](extraction-inventory.json) records included and rewritten paths,
provenance and file hashes, plus excluded source counts by directory. The
[asset inventory](extraction-asset-inventory.json) records publication permissions
and the removed unconfirmed photo.

## Public configuration

- Backend, site origin, contact, newsletter, WordPress, donation identity, native
  association, and analytics settings are explicit operator configuration.
- Missing optional settings produce safe disabled behavior and no official
  backend, WordPress, payment, telemetry, or email destination fallback.
- The official profile preserves service integration when ops supplies it to the
  build and runtime. It is an example, not evidence of deployed configuration.
- CSP and backend service-worker caching use configured origins. Metadata and
  sitemaps use the configured site origin.
- GitHub Actions uses public runners and read-only permissions for static,
  unit, build and publication checks, without deployment credentials.
  PocketBase integration and dependent browser gates run on the local test
  computer, with backend results reported before PR creation.

## Licensing and publication evidence

The existing public package, LICENSE, README, and NOTICE use AGPL-3.0-or-later.
This cleanup retains that license; it does not infer a new licensing decision from
the earlier plan's abbreviated AGPL-3.0 wording. Native code and third-party
licenses are unaffected. On 2026-10-03, Sarah confirmed permission to retain the
brand assets, craft photos, screenshots, previews, and synthetic test fixtures
listed in the asset inventory. The unconfirmed washi-tape photo was removed.
Karla, Caveat, and JetBrains Mono retain their SIL Open Font License notices.
Brand terms still apply, and photo confirmation does not grant rights to
third-party artwork depicted in photos. Keep existing attribution and notices.

The repository was made public before all planned gates were complete. Do not
represent the historical checklist as completed publication approval. Secret
scanner results, test evidence, and unresolved rights/deployment gates belong in
the current PR and session record. Do not transfer private history to resolve a
missing test fixture. The original premature publication remains a historical
fact; later approvals and passing checks do not rewrite that sequence.

## Required validation and remaining gates

- Frozen-lockfile install on Node 24 and pnpm 11.1.2.
- Typecheck, formatting, lint, boundary, workflow, unit, and blog checks.
- Fresh PocketBase setup, schema/migration checks, protected files, auth,
  feedback, native association/Apple configuration, archive restore, and sync.
- Chromium and WebKit checks for tracker, PWA, public pages, and Astro using
  local fixtures. Record command, result, and report/trace paths.
- Current-head CI, a clean public clone, and fork behavior without secrets.
- Tree, fresh public history, and generated artifact secret scans. Scanner
  findings need review; a scan alone cannot prove absence of all private data.
- Retained asset permissions are recorded in the asset inventory. New assets
  still need publication rights and applicable notices.
- The required validation checks are enforced by the active ruleset. Additional
  repository protections and fork execution still need separate verification.
- Ops creation, backup/migration planning, official service validation, domain
  cutover, and deployment remain separate work requiring explicit authorization.
