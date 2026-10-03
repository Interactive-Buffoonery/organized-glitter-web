# Continuous integration

All pull requests and the weekly Sunday run use the same public CI with read-only
permissions and public Ubuntu runners. Tests use local services and synthetic
data, without credentials.

| Job                    | Required checks                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Select CI scope        | Trusted event base, changed paths, and conservative backend/browser plan                                                |
| Static checks          | Typecheck, formatting, lint, backend boundary, workflow lint                                                            |
| Unit and server tests  | Vitest and blog tests                                                                                                   |
| PocketBase integration | Schema, migrations, comparison-baseline upgrade, protected files, auth, feedback, native Apple, archives, sync, stats   |
| React review           | Changed source review against the trusted event base                                                                    |
| Browser validation     | Chromium and WebKit public/PWA/smoke/protected-file/blog flows; broader selection for release, weekly, and manual runs  |
| Publication security   | Production build and budget; runtime paths, SQLite blobs, complete history, tracked tree, and generated website secrets |
| CI result              | Selected jobs must pass; jobs omitted by the plan must be skipped; missing, canceled, or inconsistent results fail      |

`pnpm test:pr` first writes a local advisory [native app sync report](../native-sync-report.md).
Its findings do not block the web gate, and it is skipped in CI. The required
phases of the complete local PR gate start with static checks. It also
runs the production build and budget, publication scans, backend integration,
unit tests, and the PR browser selection. `pnpm test:release` uses the same local
gate with the broader browser selection. Browser runners print report and trace
paths. Keep databases, auth state, user files, and credentials out of public
artifacts. CI does not deploy the website.

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

Scheduled and manual runs also default to that stable populated revision and
always select backend and full browser validation. A manual dispatch can supply
an explicit `comparison_base` commit or ref. The populated revision is a broad
comparison marker until the project records its first release baseline. It is
not proof of the schema currently deployed anywhere.

Static checks, unit and server tests, React review, and publication security run
for every change. Backend and browser jobs may both be skipped for ordinary
Markdown-only documentation changes. Browser validation still runs for narrow
presentation changes. Backend and browser validation both run for PocketBase,
server, auth, startup, routing, environment, configuration, lockfile, workflow,
test, and other shared or unclassified changes. Main-target pull requests, main
pushes, weekly runs, and manual runs always select both expensive jobs and the
full browser suite.

The scope job passes its exact plan to `CI result`. A selected job must report
success. An unselected backend or browser job must report skipped. Missing jobs,
unexpected skips, failures, cancellations, or an incomplete plan fail the
aggregate check.

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
