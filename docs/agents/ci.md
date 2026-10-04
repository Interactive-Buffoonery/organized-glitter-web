# Continuous integration

GitHub Actions runs scope selection, static checks, unit/server tests, React
review, production build/budget, and publication security. `CI result` requires
every one of those jobs to succeed. Actions does not install, start or test a
PocketBase runtime, and does not run the backend-dependent browser suites.

## Local runtime validation before PR creation

`pnpm test:pr` runs PocketBase first on the computer doing the work, then static,
unit, React, build, publication and browser checks. The backend suite boots
checksum-verified binaries, validates the comparison-baseline upgrade and
exercises protected files, authentication, feedback, Apple, archive, sync and
stats behavior. It also seeds and checks the example library in a local server.
A failure stops subsequent phases. `pnpm pr:create` only opens the PR after the
complete local gate succeeds.

For a focused backend run:

```bash
VALIDATION_BASE_REF=origin/dev pnpm pb:validate:local
```

Both commands write `summary.json` and a readable `report.md` under ignored
`.tmp/local-validation/<run>/`. Report the PocketBase outcome to Sarah before
opening a backend PR, then include it in the PR validation section. Record the
machine, baseline, commands, behavior tested, and any failures or coverage gaps.
The report contains source and phase identity, not credentials or runtime data.

`pnpm test:release` retains the broader local browser selection. Keep databases,
auth state, images uploaded by users and credentials out of public artifacts.
Passing Actions verifies the remote static/unit/publication gate only; it does
not prove local backend or browser acceptance, nor deploy the website.

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

The scope helper still resolves the event comparison baseline used by React
review and can describe local runtime coverage. Backend and browser selection
outputs do not start hosted runtime jobs. Scheduled and manual Actions runs
execute the same static/unit/publication jobs as pull requests.

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
