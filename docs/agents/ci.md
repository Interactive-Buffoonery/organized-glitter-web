# Continuous integration

All pull requests and the weekly Sunday run use the same public CI with read-only permissions and public
Ubuntu runners. Tests use local services and synthetic data, without credentials.

| Job                    | Required checks                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Static checks          | Typecheck, formatting, lint, backend boundary, workflow lint                                              |
| Unit and server tests  | Vitest and blog tests                                                                                     |
| PocketBase integration | Schema, migrations, bootstrap baseline, protected files, auth, feedback, native Apple, archives, sync     |
| Production build       | Portable production build and bundle budget                                                               |
| React review           | Changed source review against the public main branch                                                      |
| Browser validation     | Chromium and WebKit public/PWA/smoke/protected-file/blog flows                                            |
| Publication security   | Private runtime paths, SQLite blobs, complete-history and tracked-tree secrets, generated website secrets |
| CI result              | Every expected job must pass; missing, canceled, or skipped jobs fail                                     |

`pnpm test:pr` runs the corresponding local gates. The first public PR has an
empty root commit as its baseline. Later PRs retain normal schema upgrade checks.
Browser runners print report and trace paths. Keep databases, auth state, user
files, and credentials out of public artifacts. CI does not deploy the website.

Branch protection and fork execution must be verified separately by an owner.
Passing checks do not prove official provider, mail, backup, or deployment gates.

## Publication security

`Publication security` runs on standard GitHub-hosted Ubuntu runners without
service credentials. It checks all available Git history and the tracked tree,
then builds and scans the generated website. Gitleaks 8.30.1 is pinned and its
download checksum is verified. Scanner output is fully redacted. This job does
not upload source, databases, auth state, traces, or scanner reports as artifacts.

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

## Initial React baseline

The empty public root has no React source to compare. For that first PR only,
the blocking changed-source review uses the initial public extraction revision
`30aebeccf408ce7aa2cb3fdea55e06de1d838ecc`. The runner verifies it is an ancestor
of HEAD. Subsequent PRs use the normal public main baseline. No rules are disabled.

The whole initial extraction was also scanned: React Doctor reported ten errors
in unchanged code (nine ref writes during render and one effect-cleanup warning).
The latter hook already clears its timer and removes its event listener in its
cleanup. Ref writes in crop/avatar reset handling, editor callbacks, offline
checks, mystery reveal state, and render telemetry need a separate correctness
review. This baseline does not claim those findings have been fixed.

Follow-up: [INT-1208](https://linear.app/interactive-buffoonery/issue/INT-1208/review-react-lifecycle-findings-from-public-extraction).
