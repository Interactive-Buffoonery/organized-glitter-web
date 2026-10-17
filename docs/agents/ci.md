# Continuous integration

GitHub Actions retains scope, static, unit/server, React, build/budget and
publication gates and adds `Complete PR validation` on GitHub-hosted
`ubuntu-24.04`. It runs the existing strict `pnpm test:pr` orchestration rather
than maintaining a second test inventory. `CI result` fails closed unless every
expected job succeeds, including complete PR validation.

## Cloud drafts and complete validation

```bash
VALIDATION_BASE_REF=origin/dev pnpm test:cloud
```

This cloud profile runs backend, static, unit, React, build and publication
checks. It writes `summary.json` and `report.md` under ignored
`.tmp/local-validation/<run>/`, including source/base identity. Every browser
phase is explicitly `delegated-to-ci`, never a local pass. A successful cloud
run says `cloud-checks-passed`; complete PR validation remains unestablished.
Failures stop execution and remaining executable phases say `not-run`.

After cloud checks, open a **draft** PR against `dev` with exact head/base SHAs,
local results and limitations. If the cloud environment blocks a check, include
the evidence and mark it blocked; the draft may obtain hosted proof. Backend
source changes still require running and reporting the local backend profile
before a draft. `pnpm test:pr` and `pnpm pr:create` remain strict.

The hosted job installs Node from `.nvmrc` (24.x), pnpm from `packageManager`
(11.1.3), and frozen lockfile dependencies with the existing setup action and
provenance policy. `pnpm exec playwright install --with-deps chromium webkit`
installs browsers matching that lockfile plus Ubuntu system libraries. The job
uses no production credentials and boots checksum-verified disposable local
PocketBase through the existing backend and browser harnesses, with synthetic
fixtures. The strict gate executes, in order:

1. Backend, including schema, migrations, baseline upgrade and runtime suites.
2. Static, unit/server, changed-source React, build/budget and publication checks.
3. Not-found, PWA navigation, cold-load, browser smoke, protected-file browser
   (Chromium and WebKit), and blog browser.

A failure leaves subsequent phases not-run. Fix infrastructure defects and
rerun affected checks; report genuine application failures separately. The
historical PR 91 startup `page.unrouteAll` timeout is not assumed fixed: compare
any recurrence on head and the exact `origin/dev` baseline.

The proposed required check names are **`Complete PR validation`** and the
existing aggregate **`CI result`**. Sarah can require them after observing the
workflow. Before merge, both must pass for the latest PR commit, with complete
backend/browser coverage. The complete job checks out the exact event PR head
SHA and uses the event base SHA for comparisons. Record both SHAs in the PR.
No branch protection or repository permissions are changed by this work.

Actions uses ordinary `pull_request` semantics, read-only contents permission,
no persisted checkout credentials, bounded timeouts and cancellation of
superseded PR runs. No privileged PR-code trigger or production service is
used. Only the sanitized phase report is written to the job summary. **No
artifacts are uploaded**, so databases, authentication state, traces, images,
runtime logs and private files have no artifact retention. Keep local reports
private unless reviewed for publication.

`pnpm test:release` retains its broader local browser selection. After backend
passes, local gates may write the advisory [native sync report](../native-sync-report.md);
it is skipped in CI. Passing these checks does not deploy, release, certify
provider settings or validate hosted production hooks and migrations.

## Event comparisons and scope

Pull requests compare the checked-out head with the event's exact base SHA by
using a merge-base diff. Pushes compare the pushed head with the event's exact
before SHA. If a force push makes a nonzero before SHA unavailable locally, the
scope job fetches that exact commit and fails closed if it cannot. It never
substitutes a different reachable commit.

An all-zero push before SHA means GitHub created a branch. That case selects the
full suite and compares with the populated public extraction revision
`04789b9d000e6eb1390ca2a6ae60f855a3b1fca6`. It does not claim that the new
branch previously deployed that schema.

The scope job exports the event comparison baseline for React review and the
complete PR validation job. Scheduled and manual runs execute the same full gate.

Branch protection and fork execution must be verified separately by an owner.
Passing checks do not prove official provider, mail, backup, or deployment gates.

## Publication security

`Publication security` runs on standard GitHub-hosted Ubuntu runners without
service credentials. The installed Husky pre-push hook rejects private runtime
files and scans Git history before upload. `pnpm test:publication` installs
Gitleaks 8.30.1 from its
[official releases](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
and verifies the platform archive checksum. A missing or unverifiable scanner
blocks publication validation.

The CI job builds the website, enforces the bundle budget, then checks all
available Git history, the clean tracked tree, and the generated website.
Gitleaks 8.30.1 is pinned and its download checksum is verified. A missing
scanner, unavailable clean tracked-tree archive, missing build output, or
incomplete Git history fails the job. Scanner output is fully redacted. This job
does not upload source, databases, auth state, traces, or scanner reports as
artifacts.

`node scripts/check-publication-files.mjs` rejects runtime databases, backups,
auth state, private keys, and environment files in tracked paths or history.
It also checks historical Git blobs for the SQLite header, including renamed
or deleted databases. Shallow history fails the check. Public schema JSON,
JavaScript migrations, and the two reviewed environment examples remain source.

`.gitleaks.toml` retains the default scanner rules. Exceptions match only two
synthetic logger-test values at their exact source path and a verified PocketBase
SDK identifier sequence in its generated sourcemap. Review changes to this file
and security workflow steps before merging. A passing scanner is not proof that
all private data or third-party assets are safe to publish.

## Bootstrap and default branch transition

The empty public root has no React source to compare. For that first PR only,
the blocking changed-source review uses the initial public extraction revision
`30aebeccf408ce7aa2cb3fdea55e06de1d838ecc`. The runner verifies it is an ancestor
of HEAD. Subsequent PRs use the event's actual target base. No rules are disabled.

Only a commit with an empty tree and no parent receives the React and PocketBase
bootstrap exception. A commit that deletes an existing tree remains a normal
comparison base. The populated broad comparison revision is separate from this
empty-root exception.

As observed on 2026-10-03, the remote has no `dev` branch and its symbolic
default still identifies `bootstrap/public-extraction`. The workflow does not
create branches or change repository settings. Until the owner creates `dev`
from the accepted post-bootstrap history and chooses the intended default
branch, pull requests targeting `main` receive the full release selection.
Branch protection changes remain a separate owner operation after `CI result`
has run successfully on the installed workflow.

The whole initial extraction was also scanned: React Doctor reported ten errors
in unchanged code (nine ref writes during render and one effect-cleanup warning).
The latter hook already clears its timer and removes its event listener in its
cleanup. Ref writes in crop/avatar reset handling, editor callbacks, offline
checks, mystery reveal state, and render telemetry need a separate correctness
review. This baseline does not claim those findings have been fixed.

Follow-up: [INT-1208](https://linear.app/interactive-buffoonery/issue/INT-1208/review-react-lifecycle-findings-from-public-extraction).

## Dependency security reports

The scheduled dependency workflow reports both production and development
advisories. Do not disable pnpm's release-age or trust-downgrade protections to
refresh the lockfile. Security refreshes preserve compatible major versions.

On 2026-10-03, the available brace-expansion, fast-uri, serialize-javascript, and
DOMPurify fixes were applied. The production audit then reported no advisories.
The full audit retained two high entries with no published upstream fix:

- `http-cache-semantics@4.2.0` is protected by the committed patch. The blog
  cache-policy tests verify max-stale revalidation, private/cookie responses,
  Vary handling, and stale-if-error behavior. Keep the patch until an upstream
  release passes those regressions. The audit checks the version, not the patch.
- `braces@3.0.3` is used by the development-only ts-prune tool. No deployed
  request path supplies its glob patterns. The nested-pattern denial of service
  remains a tooling follow-up until a patched version is published.

These entries remain visible in the audit report. This does not certify provider
settings or production behavior.
