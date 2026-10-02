# Continuous integration

All pull requests and the weekly Sunday run use the same public CI with read-only permissions and public
Ubuntu runners. Tests use local services and synthetic data, without credentials.

| Job                    | Required checks                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Static checks          | Typecheck, formatting, lint, backend boundary, workflow lint                                          |
| Unit and server tests  | Vitest and blog tests                                                                                 |
| PocketBase integration | Schema, migrations, bootstrap baseline, protected files, auth, feedback, native Apple, archives, sync |
| Production build       | Portable production build and bundle budget                                                           |
| React review           | Changed source review against the public main branch                                                  |
| Browser validation     | Chromium and WebKit public/PWA/smoke/protected-file/blog flows                                        |
| CI result              | Every expected job must pass; missing, canceled, or skipped jobs fail                                 |

`pnpm test:pr` runs the corresponding local gates. The first public PR has an
empty root commit as its baseline. Later PRs retain normal schema upgrade checks.
Browser runners print report and trace paths. Keep databases, auth state, user
files, and credentials out of public artifacts. CI does not deploy the website.

Branch protection and fork execution must be verified separately by an owner.
Passing checks do not prove official provider, mail, backup, or deployment gates.

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
