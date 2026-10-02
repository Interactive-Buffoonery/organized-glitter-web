# Continuous integration

Feature branches target `dev`. Releases target `main` from `dev`.

CI runs for pull requests against every base branch so upper layers of a native
GitHub stack receive the same checks. The bottom layer targets `dev`; each
following layer targets the branch below it.

## Merge contract

`CI result` is the authoritative check. It runs after every expected dependency
and passes only when all of these jobs succeeded:

- Static checks: generated recovery HTML parity, supported TypeScript commands, Prettier, ESLint, PocketBase
  boundaries, and pinned actionlint workflow validation.
- Unit and server tests: the full Vitest suite, including tooling regressions.
- PocketBase contract and upgrade: schema validation, migration safety checks,
  migration validation from the base revision's schema, verified API access,
  and social account step-up proof checks.
- Production build: a production bundle configured for the isolated browser
  backend. This is a test build, not a deployable production release. The job
  reports eager shell gzip/Brotli sizes and unique service-worker precache
  bytes, then checks gzip and raw precache sizes against the committed baseline
  with 2% growth headroom. Its job summary and log include the measurements;
  the downloadable `bundle-budget-report` artifact is best effort when artifact
  storage is unavailable. Run `pnpm build:budget` after `pnpm build` locally.
- Browser smoke: built standalone and client-side not-found recovery checks,
  production service-worker navigation regressions in Chromium and WebKit,
  plus selected Chromium and mobile WebKit flows. The PWA test
  uses a local backend URL and intercepts collection requests; it requires no
  production backend access. The browser job builds its own production bundle
  and starts the local build server and disposable PocketBase records. Hosted
  Spacefast behavior is checked separately with `pnpm test:e2e:spacefast`.
  The job has a 30-minute budget including browser and system dependency
  installation. Slow dependency mirrors can use most of the former 20-minute
  budget before the tests finish.
- React Doctor: the official action, pinned to a commit and an exact scanner
  version, reports findings introduced against the pull request base commit.

Failures, cancellation, missing results, and unexpected skips fail the aggregate.
There are no path filters on this workflow. Documentation changes still receive
the same predictable result. Normal build and test jobs use read-only repository
permissions and receive no production credentials.

The bundle baseline in `scripts/bundle-budget-baseline.json` comes from a local
production-mode build on September 29, 2026: 517,022 bytes gzip of eager
JavaScript and CSS, and 5,242,596 raw bytes across 133 unique precache URLs
(138 generated manifest entries). The increase records the data router required
for dirty-form navigation blocking; route-level form code remains dynamically
loaded. The shell calculation starts from generated
`dist/index.html` and follows static imports in the Vite manifest; dynamic
imports remain outside it. The precache calculation reads the generated
service worker and counts each URL once. Compression of local files estimates
transfer size and excludes network headers, browser cache effects, and CDN
encoding choices. Lower the baseline after a verified reduction; raise it only
with a measured explanation.

A read-only public asset check on September 27, 2026 found that the seven
JavaScript and CSS assets referenced by the public index transferred 491,594
bytes with gzip or 481,905 bytes with Brotli. The public asset responses served
the requested encoding and used long-lived immutable caching. This production
snapshot is separate from the CI build because the deployed revision and build
environment differ. Neither figure establishes which routes should remain
available offline; a product decision and installed-PWA tests are still needed
before reducing the precache list.

React Doctor writes its report to the job summary. PR comments, inline review
comments, and commit statuses are disabled. Pull requests fail on introduced
error-severity findings. Push and manual runs are advisory full-project
snapshots, so existing findings do not make those runs fail.
The React Doctor checkout includes full Git history so pull requests can compare
findings against their merge base without losing the introduced-errors baseline.

The committed React Doctor configuration disables scoring and supply-chain
network checks. The workflow and package scripts disable telemetry before the
scanner starts.
OpenCode reviews, Cursor Bugbot reviews, and size labels are separate from the
merge contract.

## Spacefast Git deploys

Spacefast has two Git connections to this repository: `dev` for the private
`organized-glitter-preview` Space and `main` for the public `organized-glitter`
Space. Both connections have `autoDeployProduction` and `autoDeployPreviews`
off, so pushes do not publish on their own. Live updates come from the
CI-gated job below. The production Space serves `organizedglitter.app` and
`www.organizedglitter.app`.

Both connections currently use a build-command workaround that strips NUL
characters from build output while preserving the command's exit status.
Spacefast failed to store a Vite warning containing `\u0000` in its build log;
non-live Git builds of both branches succeeded with the filter. Keep the
workaround until Spacefast fixes build-log handling and an unfiltered Git build
succeeds. Native builds use Node 22 and lack the PostHog CLI credentials, so
they are not a supported live path; resolve both before turning auto deploy
back on.

Use `sf git ls --space organized-glitter --team sarah-team` and
`sf git ls --space organized-glitter-preview --team sarah-team` to verify the
saved branch, build command, and auto-deploy switches. The failed production
build was `bld_a049cceb850145489b8eacf1b44bb475`; filtered non-live builds
`bld_a82a13201d8d45748a2b984a852b07df` (`main`) and
`bld_8f35c19a2ee94132ad7fe96c89c53db8` (`dev`) succeeded. The merge of
PR #330 to `dev` triggered build `bld_cdcbbaa0e779412590da72c36c2f7f74`,
which published ready live version `ver_53804ae7804d4fe498ab34bf1e33c729`
from commit `5f8e0ebbec62ebd64df17ec05dfc02eec0cf1c52`. It published before
the post-merge CI run finished, which is why CI now owns deploys.

`Publish Spacefast preview` remains a manual fallback on `dev`. It builds the
exact commit with Node 24 and PostHog source-map upload, stages the Functions,
and publishes prebuilt output to the private preview Space. Running it can
replace a version published by the Git connection. Record the intended commit
and version before using it; do not treat it as the normal push path.

The repository Actions secrets `POSTHOG_CLI_API_KEY` and
`POSTHOG_CLI_PROJECT_ID` are available only to the build step.
The public `VITE_PUBLIC_POSTHOG_KEY` repository variable is also required at
build time so browser analytics are enabled.
`SPACEFAST_TOKEN` is available only to the publish step. The workflow requires
the source-map upload success message and checks that no `.map` files remain
before publishing.

For a deliberate fallback, open GitHub Actions, choose
`Publish Spacefast preview`, select `dev`, and click `Run workflow`. Its
`Build and publish dev preview` job must pass before treating the private URL
as updated. The `production` publish target here means the live version of the
private preview Space, not the public `organizedglitter.app` site.

## Spacefast production candidate

`Build Spacefast production candidate` is a manual workflow for the accepted
`main` commit. Configure the repository variable
`SPACEFAST_PRODUCTION_SPACE_ID` with the production Space ID before running it.
Select `main` in Actions and enter its full 40-character SHA in `main_commit`.
The workflow rejects any other branch or a mismatched SHA.

It builds with the production app and PocketBase URLs, uploads PostHog source
maps, stages the Functions, and validates a dry-run package. It then publishes
to the production Space with `--target preview`. The workflow checks the
receipt for a ready immutable version and an unpromoted activation, then writes
the commit, version ID, immutable URL, and prior live version to the job summary.
It does not promote a version, attach a domain, or change DNS. Use the immutable
URL for the production candidate checks in
[`spacefast-cutover.md`](../spacefast-cutover.md). A successful workflow only
establishes the candidate artifact; it does not pass the cutover acceptance
gates.

## CI-gated Spacefast deploys

The `deploy-spacefast` job in `CI` can publish the live Space after the
`CI result` job passes. It builds with Node 24, requires PostHog source-map upload,
checks that no `.map` files ship, stages the Functions, and verifies the live
runtime after publishing. It uses `dev` for the private preview Space and
`main` for the public production Space. Immediately before publishing, it
checks that the branch still points to the commit it built.
If the branch has advanced, it skips publication successfully and records the
reason in the job summary. Runtime verification runs only after publication.
It refuses to publish while the selected Space still has native automatic Git
deploys on.
Push CI runs cannot cancel an in-flight publish. The CI job and manual preview
workflow serialize writes to the preview Space, and the manual workflow refuses
to publish while CI owns deployments.
The public production check also probes the live PostHog proxy. The private
preview URL returns 403 without a visitor grant, so its job checks runtime
readiness through the Spacefast API. Preview acceptance still needs a separate
authenticated PostHog check.

This job runs only while the repository variable `SPACEFAST_DEPLOY_OWNER`
equals `github-actions`, which has been set since 2026-09-27. To hand ownership
back to native Git deploys, pause pushes, unset the variable, wait for in-flight
CI runs to finish, then turn `autoDeployProduction` back on. Never leave both
publishers active. The manual preview and production candidate workflows remain available
for deliberate use; the candidate workflow does not update the live channel.

## Local validation

The browser job also runs `pnpm qa:blog`. It builds the opt-in Astro blog
against a local WordPress fixture and checks it in Chromium and mobile
WebKit, including an empty archive. Reports are saved under `.tmp/blog-qa/`.
The content parser tests run through `pnpm test:ci:unit`.

`Build blog content candidate` builds current public WordPress content from
an exact `main` commit with successful CI and publishes an unpromoted
Spacefast version. It shares the `spacefast-production` concurrency group.
Its optional hourly schedule is disabled unless `BLOG_CONTENT_REFRESH_ENABLED`
is `true`. It never promotes the candidate or sends MailPoet emails. See the
[blog runbook](../astro-blog.md) before enabling content refresh or cutover.

Install dependencies with `pnpm install --frozen-lockfile`, then install the
browser engines once with `pnpm exec playwright install chromium webkit`.

```bash
pnpm test:pr
```

This runs the same static, React Doctor, backend, unit, and browser checks as CI.
The browser harness builds the app locally. Actions runs a separate production
build check, then the browser job builds its own copy. This avoids storing a
bundle for every CI run. PocketBase downloads are pinned and checksum verified.
Tests create only disposable data under `.tmp/`.

The protected-file rotation browser check uses `pnpm` by default. On machines
with the optional `og-test-pr` wrapper, set `OG_BROWSER_RUNNER=og-test-pr` to
use it explicitly.

The default local comparison branch is `origin/dev`. Fetch that branch before
validation. Set `CI_BASE_REF` for a different React Doctor comparison; pass
`--base-ref` to `pnpm pb:validate:upgrade` for a different backend baseline.
Neither command accepts a missing baseline.

Individual checks:

```bash
pnpm test:ci:static
pnpm test:ci:react
pnpm doctor
pnpm test:ci:unit
pnpm pb:validate:schema
pnpm pb:validate:migrations
pnpm pb:validate:upgrade --base-ref=origin/dev
pnpm pb:test:auth-verification
pnpm pb:test:auth-step-up
pnpm qa:browser
pnpm qa:browser:full
```

Workflow validation installs actionlint 1.7.12 in the ignored `.tmp/ci-tools`
directory using an embedded SHA256 checksum. Transient GitHub release download
failures (502, 503, 504, or network errors) are retried. A checksum mismatch
deletes the cached archive so the next run downloads again. It validates all
workflow files, including new untracked files. Optional external ShellCheck and
Pyflakes are disabled so results do not depend on tools installed on one
developer's machine. Behavioral tests cover the CI result and automation helpers
separately.

## Browser and backend evidence

See [Playwright testing](../testing-playwright.md) and
[local PocketBase development](../pocketbase/local-development.md) for suite
selection, disposable data, fixture requirements, and upgrade limitations.

A fresh schema import is not proof of an upgrade. The backend check uses the
base revision's schema and validates newly introduced deployable migrations;
existing migration history must not be blindly replayed against a schema that
already contains those changes.

Browser tests must fail on missing required fixtures rather than reporting a
passing suite with no exercised flow. The CI suite does not include the visual
screen atlas. Mobile WebKit automation supplements physical iPhone testing;
it does not certify the full iOS keyboard, camera, or PWA experience.

Failed browser runs upload traces, screenshots, reports, and harness logs for
seven days, including canceled runs when the runner can still upload them.
Both browser jobs use the official Playwright Ubuntu 24.04 container with
preinstalled browsers and system dependencies. CI reads the exact installed
`@playwright/test` version after the frozen lockfile install, resolves its matching
Noble image through Microsoft's registry, and passes a digest-pinned image to the
browser job. Dependabot checks npm updates weekly, so a Playwright update selects
its matching browser image without manual workflow edits. Package updates still
land through reviewed PRs and CI.

The production build job resolves the image for smoke CI. Full browser validation
uses a small preparation job with the same resolver. Registry requests have
bounded retries for transient failures. Missing images, invalid versions, and
missing or malformed digests fail the job; CI never substitutes another version
or a floating tag. Each run logs the selected version and digest.

Node 24 and pnpm still come from the shared setup action. Blacksmith caches
container images across runs.
The jobs install only the small `unzip` utility needed for PocketBase archives;
they do not reinstall Playwright's Linux dependencies or browsers.
The smoke job retains its 30-minute limit. A September 30 run spent 21 minutes
downloading Ubuntu packages, which exhausted that budget. Browser downloads took
about 33 seconds, so caching browser executables alone would not fix that delay.
Database directories and authentication state are not intentionally
published as artifacts. Production test bundles are not uploaded.

## Broader validation

`Browser validation` runs the broader Chromium and WebKit suites on PRs targeting
`main`, on manual dispatch, and Tuesdays at 08:23 UTC. Scheduled runs use the
default branch (`dev`). It builds and tests its own disposable instance and
excludes the screenshot atlas.

`Dependency security report` runs Tuesdays at 08:43 UTC and on manual dispatch.
It reports high and critical advisories with separate production-only and full
dependency reports. Failures are visible in Actions but are not part of
the PR merge gate. The JSON report is retained for fourteen days; investigation
must distinguish shipped dependencies from development tooling before deciding
how to remediate.

Dependabot proposes npm and GitHub Actions updates against `dev`. Action pins
are full commit hashes, with version comments for update tooling.

## Enforcement and rollout

[Branch protection](./main-branch-protection.md) records the live plan limitation
and the intended required checks. A successful check is currently evidence for
the person merging, not a substitute for unavailable GitHub enforcement.

Before changing required checks after a plan upgrade, land and observe the new
workflow on a real PR, then configure the exact `CI result` check name. Require
`Full Chromium and WebKit validation` on `main` as the additional release gate.
Do not remove old required check names before their replacement is producing
results. Keep OpenCode advisory, and review the commit attribution on its output.

Changes to privileged OpenCode workflow helpers become authoritative only after
they land on the trusted default branch. Test their pure functions locally first,
then validate live events after publication. Do not run PR code under privileged
review credentials to test the new workflow early.
