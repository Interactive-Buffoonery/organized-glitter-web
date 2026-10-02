# Organized Glitter web open-source extraction manifest

Status: extraction plan only. No app files have been copied, no repository has
been created, and no deployment or production configuration has changed.

- Source: private `Interactive-Buffoonery/organized-glitter`.
- Target: public `Interactive-Buffoonery/organized-glitter-web`, AGPL-3.0.
- Inventory date: 2026-10-02; source branch: `dev`.
- Inventory commit: `647ecd9bdbdfffa37c693e914f06a3ba39fead41` (manifest branch
  merged with current `dev` after review fixes; refresh again immediately before
  bootstrap if `dev` moves).
- Native: `Interactive-Buffoonery/organized-glitter-app` is a separate **public**
  Apache-2.0 repository. Include shared backend contracts here, not native SwiftUI
  source.
- The public web repository becomes the canonical web and PocketBase source.
  Do not create a permanent `organized-glitter-private` app fork. An optional
  ops repository may contain deployment orchestration, infrastructure templates,
  and operator runbooks. It must consume an immutable public source revision,
  not maintain another copy of application code. Credentials belong in a secret
  store, not in either repository. The existing private repository can remain a
  frozen historical archive after cutover.

Read for this inventory: `AGENTS.md`, `README.md`, `docs/codebase/README.md`,
all hook filenames and hook responsibilities, workflows and job definitions,
route pages, package scripts, schema/bootstrap tooling, and tracked URL matches.
This is a source inventory, not a completed secret, asset-rights, or history audit.

### Review fixes applied (2026-10-02)

- Refreshed inventory commit after merging current `dev` into the manifest branch.
- Added `scripts/fixtures/`, `scripts/resolve-playwright-image.mjs`, and explicit
  Apple test-support file list required by retained backend tests.
- Excluded blog Vite entry files and documented `vite.config.ts` cleanup.
- Added `listAllPages` support-contact cleanup, `docs/pocketbase/archive-restore-performance.md`,
  `BRAND.md`, single `.env.example` policy, migration count update (35), and
  bootstrap asset-rights gate.

Re-run the tracked-file URL inventory script at bootstrap; the appendix below
includes post-merge additions but is not guaranteed exhaustive if `dev` moves
again.

## 1. Include list

Copy from the pinned commit using Git's tracked-file inventory, not an unrestricted
filesystem copy or a normal `rg --files` result. Several tracked hooks, migrations,
and scripts still match ignore rules, so default searches omit them. All 29 hook
files and 35 deployable migration files found on disk are tracked at this commit.
Untracked local files must not be added implicitly.

Decisions mean:

- **Include:** copy source and retain its behavior.
- **Include-with-note:** copy source only after the named cleanup is complete.
- **Exclude:** do not place the file in the public repository, including a public
  archive directory. Keep historical material in the frozen source archive.

The following is the copy set. The exclusions in section 2 take precedence over
any directory inclusion. Sections 3 through 8 identify required rewrites.

| Exact source path or set                                                                                                                          | Decision and extraction action                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/`                                                                                                                                            | Include-with-note. Keep craft features, auth, profile, query/mutation layers, generated types, validation, CSS, utilities, local state, fixtures, and colocated tests. Apply the surface and URL changes below.                                                                          |
| `pb_hooks/`                                                                                                                                       | Copy exactly the included files in section 3 and its helper list; exclude the legacy stats-collection creator. No runtime private configuration.                                                                                                                                         |
| `pb_migrations/`                                                                                                                                  | Include all 35 tracked `.js` files, including verified auth, step-up, archive v3, Apple grants, mobile sync, artwork thumbnails, revisions, theme palette, and taxonomy guards. They are incremental changes, not a complete empty-database bootstrap.                                   |
| `docs/pocketbase/collections.schema.json`, `docs/schema/collections.md`                                                                           | Include-with-note. Required full-schema baseline and collection contract. Review rules and fields for private metadata; copy collection definitions only, never records or settings credentials.                                                                                         |
| `test/`                                                                                                                                           | Include-with-note. Keep setup and core app/build/security tests; remove tests whose sole subject is excluded blog or review tooling. Rewrite deployment URL expectations.                                                                                                                |
| `e2e/`                                                                                                                                            | Include-with-note, except exclusions below. Keep authenticated, CI, accessibility, PWA, route/title, import/export, and fixture flows. Use loopback PocketBase and synthetic accounts in default runs.                                                                                   |
| `scripts/`                                                                                                                                        | Copy the explicit script and test sets below. Do not copy all ignored local scripts.                                                                                                                                                                                                     |
| `server/`                                                                                                                                         | Include-with-note. Keep `app-route-policy.js`, `local-build-server.js`, and all tracked tests. Parameterize CSP, backend origin, AASA identity, and mail/proxy integration; remove blog-serving branches. Keep the Node server as a portable hosting option, not Railway-specific setup. |
| `api/send-feedback.js`, `api/send-feedback.test.js`                                                                                               | Include-with-note as an optional legacy Node adapter. The Node server imports this handler, so do not simply omit it. Default feedback uses PocketBase mail; legacy Resend needs explicit server-only configuration and should be disabled otherwise.                                    |
| `spacefast/`                                                                                                                                      | Include-with-note. Public, optional hosting adapter and tests: `app-pages.js`, `handler.js`, `handler.test.js`, `posthog.js`, `posthog.test.js`, `sf.jsonc`. No deployment identity, credentials, mandatory PostHog, or blog dependency.                                                 |
| `public/`                                                                                                                                         | Include-with-note. Keep static CSS/JS, fonts and their notices, PWA icons, generated 404, redirects/headers, robots/sitemap, and approved visual assets. Gate image publication on the rights check below; parameterize URLs and CSP.                                                    |
| `patches/`                                                                                                                                        | Include. Preserve the lockfile's `http-cache-semantics@4.2.0.patch` dependency.                                                                                                                                                                                                          |
| `index.html`, `about.html`, `links.html`, `privacy.html`, `terms.html`                                                                            | Include-with-note. Keep the five Vite entries and pre-React loading/error recovery; rewrite metadata, support destinations, personal and legal copy.                                                                                                                                     |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`                                                                                           | Include-with-note. Rename package/repository, trim scripts/dependencies for excluded tools, then regenerate the lockfile. Keep private package publishing disabled if desired; GitHub visibility is independent of `private: true`.                                                      |
| `vite.config.ts`, `vitest.config.ts`, `babel.config.cjs`, `eslint.config.js`, `knip.json`, `doctor.config.json`                                   | Include-with-note. Remove excluded-directory and retired Railway configuration; remove the `blog-navigation` Vite entry, blog CSP/sitemap coupling, and any other blog-only build inputs. Retain the local checks and startup ordering contract.                                         |
| `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tailwind.config.ts`, `postcss.config.cjs`, `components.json`                         | Include. Keep the compiler aliases and app tooling.                                                                                                                                                                                                                                      |
| `playwright.config.ts`, `playwright.ci.config.ts`, `playwright.not-found.config.ts`, `playwright.pwa.config.ts`, `playwright.spacefast.config.ts` | Include-with-note. Default to local servers; Spacefast config is an opt-in adapter test.                                                                                                                                                                                                 |
| `start-local-dev.sh`, `.nvmrc`, `.npmrc`, `.prettierrc.json`, `.prettierignore`, `.husky/pre-commit`                                              | Include-with-note. Preserve Node 24/pnpm setup and formatting; remove excluded-tool references and private paths.                                                                                                                                                                        |
| `.gitignore`, `.env.example`                                                                                                                      | Rewrite, not blind copy. See sections 5 and 7. Consolidate `env.template` into a single `.env.example` and do not ship `env.template` in the public repo. Publish safe examples only.                                                                                                    |
| `.github/`                                                                                                                                        | Copy only the public workflow/action/config/template set in section 6.                                                                                                                                                                                                                   |
| Root docs and `docs/`                                                                                                                             | Copy only the explicit retained documentation sets in section 8, including this manifest.                                                                                                                                                                                                |
| `NOTICE`                                                                                                                                          | Include-with-note. Retain copyright and third-party notices; reconcile the current commercial-license wording with README and the selected license variant.                                                                                                                              |

### Exact script set

Include these tracked paths (with URL and dependency cleanup where applicable):

```text
scripts/README.md
scripts/app-icon-links.mjs
scripts/bootstrap-local-pocketbase.mjs
scripts/bundle-budget-baseline.json
scripts/bundle-budget.mjs
scripts/check-pb-boundary.sh
scripts/ci-result.mjs
scripts/e2e-walkthrough.mjs
scripts/ensure-startup-script-order.mjs
scripts/generate-app-icons.mjs
scripts/generate-not-found.mjs
scripts/install-pocketbase.mjs
scripts/resolve-playwright-image.mjs
scripts/run-archive-restore-v3-tests.mjs
scripts/run-local-release-qa.mjs
scripts/run-playwright-a11y-local.mjs
scripts/run-typescript-7.mjs
scripts/seed-e2e-coloring-fixture.mjs
scripts/seed-e2e-randomizer-fixture.mjs
scripts/setup.mjs
scripts/start-local-app-lan.sh
scripts/sync-local-pocketbase-hooks.mjs
scripts/test-archive-restore-v3-endpoints.mjs
scripts/test-archive-restore-v3-migration.mjs
scripts/test-archive-restore-v3-sha256.mjs
scripts/test-auth-step-up.mjs
scripts/test-auth-verification.mjs
scripts/test-color-references.mjs
scripts/test-feedback-pocketbase.mjs
scripts/test-mobile-sync-pocketbase.mjs
scripts/test-native-apple-auth.mjs
scripts/test-native-oauth-association.mjs
scripts/test-protected-file-rotation-browser.mjs
scripts/test-protected-file-upgrade.mjs
scripts/upsert-local-pocketbase-superuser.mjs
scripts/validate-migration.cjs
scripts/validate-pocketbase-schema.mjs
scripts/validate-pocketbase-upgrade.mjs
scripts/templates/404.html
scripts/fixtures/archive-restore-v3-rollback.pb.js
scripts/fixtures/production-index-inventory.json
scripts/test-support/apple/configuration.mjs
scripts/test-support/apple/fixture.mjs
scripts/test-support/apple/native_apple.js
scripts/test-support/apple/revocation_test.pb.js
scripts/test-support/apple/web_apple.pb.js
scripts/test-support/apple-grant-migration.mjs
```

Also include `scripts/lint-workflows.mjs`, rewritten for the public CI set.
Optional portable adapter scripts that stay public after cleanup:
`scripts/stage-spacefast.mjs`, `scripts/run-spacefast-e2e.mjs`,
`scripts/upload-sourcemaps.mjs`. They must not run automatically in the default
build or require a maintainer's account. Keep their behavioral tests.

Copy tracked `scripts/__tests__/` except the exact exclusions in section 2.
Include `scripts/__tests__/playwright-container.test.mjs` and
`scripts/__tests__/spacefast-deploy-workflow.test.mjs` as public adapter/CI
correctness tests. The Apple test-support files above are required because
retained backend tests import helpers such as `fixture.mjs` that ordinary
ignore-aware listings can hide. Test keys must be demonstrably synthetic and
confined to temporary test databases.

### New files required before bootstrap

Add a full `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `BRAND.md`, and a
concise public `AGENTS.md`. There is no tracked root `LICENSE` at the inventory
commit. `BRAND.md` should mirror the native repo pattern: source is open, but
the Organized Glitter name, logo, app icon, and official artwork remain
proprietary unless separately licensed. The requested target is AGPL-3.0, while
current package/README/NOTICE say AGPL-3.0-or-later. Resolve **only versus
or-later** with the copyright holder before publication and make `LICENSE`,
`NOTICE`, `package.json`, `README`, and ADR-0014 agree on the chosen variant.
Do not silently change the native app's Apache-2.0 license or third-party asset
licenses.

## 2. Exclude list

These paths are excluded from the public copy, even where currently tracked.
Paths absent at this commit remain exclusion guards, not claims that they exist.

| Exact path/set                                                                                                                                                                                                                                       | Disposition                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blog/`, `e2e/blog/`, `e2e/blog.spec.ts`, `e2e/blog.playwright.config.ts`                                                                                                                                                                            | Keep hosted WordPress/Astro publishing outside the application extraction. Remove workspace, build, navigation, CSP, sitemap, test, and dependency coupling.           |
| `src/blog-navigation.tsx`, `src/components/layout/BlogNavigation.tsx`                                                                                                                                                                                | Blog-only Vite entry and signed-in blog chrome. Exclude with the blog tree; remove the `blog-navigation` input from `vite.config.ts` during extraction.                |
| `scripts/assemble-blog.mjs`, `scripts/build-blog.mjs`, `scripts/run-blog-qa.mjs`                                                                                                                                                                     | Blog publishing tools; optional ops/content project only.                                                                                                              |
| `scripts/__tests__/assemble-blog.test.mjs`, `scripts/__tests__/blog-content-refresh.test.mjs`, `scripts/__tests__/run-blog-qa.test.mjs`                                                                                                              | Tests for the excluded blog tooling.                                                                                                                                   |
| `audits/`, `design-previews/`, `docs/audits/`, `docs/reviews/`, `docs/design-previews/`, `docs/html/`, `docs/plans/`                                                                                                                                 | Private historical investigation, review, design experiments, and roadmap. Do not ship a public archive of these.                                                      |
| `docs/agent_guidelines/`, `docs/superpowers/`, `docs/browser_testing/`, `.agents/`, `.claude/`, `.cursor/`, `.codex/`, `.pi/`, `.kiro/`, `.story/`                                                                                                   | Personal agent configuration and runbooks; replace with public contributor instructions.                                                                               |
| `docs/agents/`                                                                                                                                                                                                                                       | Exclude by default; explicit sanitized exceptions are listed in section 8. Linear triage, skill progression, review-provider setup, and personal workflow do not ship. |
| `opencode.json`, `skills-lock.json`, `.github/actions/run-opencode/`, `.github/scripts/`                                                                                                                                                             | Paid/provider-specific agent automation and its runbooks. Optional tooling/ops only.                                                                                   |
| `scripts/__tests__/opencode-github.test.mjs`, `scripts/__tests__/opencode-review-plan.test.mjs`, `scripts/__tests__/opencode-run-utils.test.mjs`, `scripts/__tests__/opencode-runner.test.mjs`, `scripts/__tests__/opencode-trust-boundary.test.mjs` | Excluded review automation tests.                                                                                                                                      |
| `scripts/audit-apple-grants.mjs`, `scripts/audit-taxonomy-duplicates.mjs`, `scripts/audit-taxonomy-duplicates.node-test.mjs`, `scripts/benchmark-status-counts.mjs`, `scripts/measure-collection-cardinality.mjs`, `scripts/new-worktree.sh`         | Operator diagnostics or private checkout workflow; optional ops/archive. Preserve necessary diagnostic guidance in generic backend docs.                               |
| `scripts/__tests__/benchmark-status-counts.node-test.mjs`, `scripts/__tests__/measure-collection-cardinality.node-test.mjs`                                                                                                                          | Excluded operator diagnostic tests.                                                                                                                                    |
| `scripts/verify-spacefast-candidate.mjs`, `scripts/verify-spacefast-preview.mjs`, `scripts/__tests__/verify-spacefast-candidate.test.mjs`, `scripts/__tests__/verify-spacefast-preview.test.mjs`                                                     | Maintainer deployment acceptance tooling; optional ops. Portable adapter correctness remains public.                                                                   |
| `docs/railway-deployment.md`, `docs/spacefast-cutover.md`, `docs/astro-blog.md`, `docs/snippets/`                                                                                                                                                    | Retired hosting/cutover or blog runbooks; frozen private archive. Also exclude `.railway/`, `railway.json`, `server/railway-server.js` if present in another snapshot. |
| `docs/pocketbase/audits/`, `docs/pocketbase/int-1088-cardinality.md`, `docs/RULE_AUDIT.md`, `docs/CROSS_PLATFORM_PREP_PLAN.md`, `docs/native-ios/release-0a-pocketbase-evidence.md`, `docs/mobile/mobile-v1-scope.md`                                | Historical/private operational evidence and superseded planning.                                                                                                       |
| `docs/pocketbase/migration-archive/`                                                                                                                                                                                                                 | Frozen historical reference, not executable bootstrap. Current schema is the fresh-install baseline; do not reactivate old migrations.                                 |
| `.snyk`                                                                                                                                                                                                                                              | Review private-repo exceptions before deciding whether any generic, time-bounded exception is still needed. Do not inherit suppressions blindly.                       |
| `docs/icons/` except retained icon sources/notices in section 8                                                                                                                                                                                      | Unused icon experiments and previews.                                                                                                                                  |
| `public/images/homepage-preview-2026-04-19-og-v2.jpg`, `public/images/homepage-preview-2026-05-29-og.png`                                                                                                                                            | Old marketing previews. Update any remaining references before dropping them.                                                                                          |
| `.git/`, `.worktrees/`, `node_modules/`, `dist/`, `dev-dist/`, `.tmp/`, `coverage/`, `playwright-report/`, `test-results/`, `e2e/.auth/`, screenshots and loose reports                                                                              | History, dependencies, build/test artifacts, auth state, and local evidence.                                                                                           |
| `.env`, `.env.*` except sanitized `.env.example`, `.pocketbase-schema.config.ts`, `local-pb-db/`, `pb_data/`, `backups/`, `temp_migrations/`, `temp_archive/`, `**/apple-auth-private/`, `*.p8`, `*.pem`, `*.key`, database/dump files               | Credentials, signing keys, grants, accounts, uploaded user data, and runtime state. No values or records in examples.                                                  |
| `.spacefast/`, `.spacefast-*`, `.mcp.json`, `.mcp/`, `reviews.db*`, `.design-sync/`, `.ds-sync/`, `ds-bundle/`, editor/personal dotfiles                                                                                                             | Local service identities, agent state, and tool caches. Publish only reviewed portable adapter configuration.                                                          |

## 3. Per-hook decisions

There are **22 `pb_hooks/*.pb.js` files** at the pinned commit. The table covers
every one. The name `organized-glitter` in API routes is a shared protocol
namespace; do not rename it just because the GitHub repository changes name.

| Hook                                          | Decision          | Rationale / required note                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pb_hooks/account_deletion_integrity.pb.js`   | Include           | Account-deletion integrity enforcement belongs with the public auth/schema contract.                                                                                                                                                                                            |
| `pb_hooks/apple_config_backup.pb.js`          | Include-with-note | Preserve private-config backup/restore exclusions. Explain that operators must provision and protect Apple configuration separately from database backups.                                                                                                                      |
| `pb_hooks/apple_grants.pb.js`                 | Include-with-note | Web OAuth grant capture and revocation are account security behavior, not private ops. Include encryption/revocation helpers; absent Apple configuration must not block ordinary local use.                                                                                     |
| `pb_hooks/archive_restore.pb.js`              | Include           | Owner-scoped restore and metric reconciliation endpoints are used by archive import.                                                                                                                                                                                            |
| `pb_hooks/archive_restore_v3.pb.js`           | Include           | Versioned capabilities and idempotent item restore are required by current import/export.                                                                                                                                                                                       |
| `pb_hooks/auth_sign_in_methods.pb.js`         | Include           | Provider linking/unlinking and password step-up protect account access; keep collision and last-sign-in-method safeguards.                                                                                                                                                      |
| `pb_hooks/color_references.pb.js`             | Include           | Swatch/photo mutation contract, validation, and ownership checks are app behavior.                                                                                                                                                                                              |
| `pb_hooks/coloring.pb.js`                     | Include           | Coloring metrics, page reduction, photo handling, and guarded revisions are required by web flows.                                                                                                                                                                              |
| `pb_hooks/coloring_medium_ownership.pb.js`    | Include           | Stops foreign-owner medium relations and resulting data disclosure. Must not be optional.                                                                                                                                                                                       |
| `pb_hooks/create_indexes.pb.js`               | Include-with-note | Keep performance indexes initially; document startup DDL and reconcile against the exported schema/migrations on a fresh instance. No production latency claims in generic docs.                                                                                                |
| `pb_hooks/create_user_stats_collection.pb.js` | Exclude           | Legacy cache collection creator uses old `collection.schema` fields. Current README directs new stats to hook APIs and schema already contains legacy collections. Bootstrap the committed schema, not this old startup creator; verify no active dependency before extraction. |
| `pb_hooks/dashboard_settings.pb.js`           | Include           | Validates/normalizes saved settings; required for consistent user preferences.                                                                                                                                                                                                  |
| `pb_hooks/feedback.pb.js`                     | Include-with-note | Verified-user endpoint, bounded body, rate limiting, and escaping are reusable. Replace the hardcoded recipient with server-only `FEEDBACK_TO_EMAIL`; use configured PocketBase mail. Missing recipient must disable delivery safely, never fall back to Sarah's inbox.         |
| `pb_hooks/latest_notes.pb.js`                 | Include           | Owner-scoped bulk latest-note lookups support feed/dashboard behavior.                                                                                                                                                                                                          |
| `pb_hooks/mobile_sync.pb.js`                  | Include-with-note | Shared backend API and receipt/idempotency contract used by the separate native app. Include here as backend source; keep native client code in its Apache repository. Local contract tests require no Apple account.                                                           |
| `pb_hooks/native_apple_auth.pb.js`            | Include-with-note | Shared native Apple sign-in endpoint belongs with its schema/auth backend. Keep readiness, nonce/provider validation, identity collision, and grant persistence. Disabled without operator Apple configuration.                                                                 |
| `pb_hooks/native_association.pb.js`           | Include-with-note | AASA endpoint currently hardcodes Apple's app identity. Configure an operator allowlist of app IDs, empty by default; never imply that self-hosted domains are associated with the official native app.                                                                         |
| `pb_hooks/record_revision.pb.js`              | Include           | Revision checks and tag-parent revision updates prevent stale writes.                                                                                                                                                                                                           |
| `pb_hooks/relation_ownership.pb.js`           | Include           | Cross-record ownership enforcement is required for isolation.                                                                                                                                                                                                                   |
| `pb_hooks/sort_proxy_sync.pb.js`              | Include           | Maintains derived sorting columns and taxonomy rename propagation.                                                                                                                                                                                                              |
| `pb_hooks/stats.pb.js`                        | Include           | Authenticated, owner-scoped diamond/coloring stats APIs are product functionality.                                                                                                                                                                                              |
| `pb_hooks/taxonomy_deletion_guard.pb.js`      | Include           | Prevents unsafe taxonomy deletion while referenced.                                                                                                                                                                                                                             |

Include these seven additional tracked files:
`pb_hooks/apple_config.js`, `pb_hooks/apple_grant_store.js`,
`pb_hooks/apple_revocation.js`, `pb_hooks/apple_web_grant.js`,
`pb_hooks/native_apple.js`, `pb_hooks/tag_revision_helpers.js`,
`pb_hooks/feedback.test.js`.
The Apple configuration reader and cryptographic implementation are public code;
`apple-auth-private/config.json`, signing/encryption keys, stored grant ciphertext,
and real test/operator configuration are excluded runtime material. Retain fake
Apple-provider tests and generic setup docs.

## 4. Page and surface decisions

| Surface / paths                                                                                                        | Decision                                                          | Result in the public app                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All craft, taxonomy, overview, notes, stats, randomizer, project/book/page detail/create/edit pages under `src/pages/` | Keep                                                              | Core product and tests remain. Preserve stable `/dashboard` and other routes, archive formats, and backend collection/API contracts.                                                                                                                                                                                                                                                                                      |
| Login/register, reset/verify/change email/password, deletion, profile/settings                                         | Keep and genericize                                               | Local account flows work without Google, Discord, Apple, PostHog, or a paid mail API. Providers appear only when configured. Operator contact and sender text are configurable.                                                                                                                                                                                                                                           |
| `src/pages/LinksPage.tsx`, `links.html`, associated tests                                                              | Genericize                                                        | Retain `/links` and the accessible layout as optional project resources. Remove Sarah's personal social/video list, avatar, affiliate referral URLs/codes, and personalized JSON-LD. Default to app and public source links; omit empty sections. Official deployment may provide its own reviewed resource configuration.                                                                                                |
| `src/pages/About.tsx`, `about.html`                                                                                    | Genericize                                                        | Describe the application and contributors. Preserve Sarah's authorship in copyright/credits. Remove personal biography, signature, chibi, and WordPress contact dependency from the default instance; use configured feedback/contact.                                                                                                                                                                                    |
| `src/pages/Home.tsx`, marketing assets, metadata                                                                       | Keep and genericize                                               | Preserve approved app identity and real craft examples only where redistribution rights are documented. Use approved substitutes or omit blocked images; do not generate replacement artwork. Remove hosted blog/newsletter assumptions.                                                                                                                                                                                  |
| `src/pages/Privacy.tsx`, `src/pages/Terms.tsx`, their HTML entries                                                     | Rewrite                                                           | Distinguish source license from the hosted operator's terms/privacy. Do not make blanket promises about providers or Sarah's data handling for someone else's instance. Require operator-provided policy/contact before public service operation.                                                                                                                                                                         |
| `src/components/profile/PayPalSupportSection.tsx`, `src/pages/SupportSuccess.tsx`, `src/pages/Profile.tsx` support tab | Genericize / remove legacy payment assertion                      | Keep feedback/install/support tab. Replace the fixed production PayPal button ID with an optional operator support link, disabled by default. Remove automatic PayPal SDK loading and the unconditional “Payment Successful” page claim; a redirect alone proves no payment. Retain the route only with neutral thank-you copy and a configured support flow. No tips entitlements or paid feature gating.                |
| Updates/newsletter/footer and account menu links: `src/constants/updates.ts`, layout consumers                         | Genericize                                                        | Optional external updates/subscribe URLs with no default WordPress origin. Hide links when absent. No embedded signup or blog build required.                                                                                                                                                                                                                                                                             |
| `src/blog-navigation.tsx`, `src/components/layout/BlogNavigation.tsx`, `vite.config.ts` blog entry                     | Exclude / rewrite build config                                    | Blog signed-in chrome is not part of the public web app. Remove the separate Vite entry and any blog-only CSP, proxy, or sitemap wiring when copying `vite.config.ts`.                                                                                                                                                                                                                                                    |
| Curator/catalog flows                                                                                                  | Remove private planning; keep only demonstrated app functionality | No implemented curator page or curator role flow was found under `src/` at this commit. `docs/plans/diamond-catalog-implementation-prompt.md` and superseded ADR-0021 describe future catalog work, not shipped routes. Exclude that planning and do not invent new curator pages, entitlements, scraping jobs, or schema. Any later curator implementation needs a new inventory and public authorization/rights review. |
| Native support/tips/RevenueCat                                                                                         | Keep separate                                                     | Native store products and Apple/RevenueCat operations stay with the native app and secret-backed ops. The web extraction does not import native SDKs or sell native entitlements.                                                                                                                                                                                                                                         |

When a surface is trimmed, update `src/components/routing/AppRoutes.tsx`,
`server/app-route-policy.js`, metadata/readiness coverage, HTML entries, sitemap,
menus, and associated browser tests together. Avoid leaving reachable dead routes
or removing a route while another retained file imports it.

## 5. Environment and URL cleanup

### Configuration contract

Use one public deployment configuration for frontend site origin, backend URL,
contact address, optional support/resources/updates links, and analytics. Use
server-only configuration for feedback recipients, sender/mailer credentials,
Apple secrets, and allowed origins/app IDs. Proposed new configuration names below
are extraction tasks, not claims that the current app already supports them.

| Setting                                                                                                            | Required extraction behavior                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_POCKETBASE_URL`                                                                                              | Default local development to `http://localhost:8090`; production must configure its own backend. Remove the production fallback in `src/lib/pocketbaseConfig.ts`. Never send a new clone's requests to the official backend.                                                |
| `VITE_APP_URL`                                                                                                     | Use configured deployment origin for metadata, canonical URLs, structured data, sitemap, and social image URLs. Development uses the local app origin. Generate HTML/static values during build, not literal `%VITE_*%` placeholders in served output.                      |
| Proposed `VITE_CONTACT_EMAIL`, `VITE_SUPPORT_URL`, resource/updates configuration                                  | Empty defaults. Hide unavailable links, and give useful local feedback/error guidance when no contact is configured. Use for taxonomy/list limit errors in `listAllPages.ts` and other user-facing support copy. Never silently send mail or payments to official accounts. |
| `VITE_APP_VERSION`, `GITHUB_SHA`                                                                                   | Keep reproducible build IDs. Remove `RAILWAY_GIT_COMMIT_SHA` from active source/config/docs.                                                                                                                                                                                |
| `VITE_PUBLIC_POSTHOG_KEY`, `VITE_PUBLIC_POSTHOG_HOST`                                                              | Optional public project configuration. No key means no capture, identify, bootstrap capture, replay, or proxy traffic. No personal/admin key in a `VITE_*` variable. Preserve redaction and opt-out/reset behavior when enabled.                                            |
| `POSTHOG_CLI_API_KEY`, `POSTHOG_CLI_PROJECT_ID`                                                                    | Secret-backed optional ops sourcemap upload only. Default build must succeed without them and without network upload.                                                                                                                                                       |
| `FEEDBACK_TO_EMAIL`, `FEEDBACK_FROM_EMAIL`, `FEEDBACK_ALLOWED_ORIGINS`, `FEEDBACK_*` limits/trusted proxy settings | Explicit server configuration for retained mail adapters; share intended recipient policy with the PocketBase hook. Document `FEEDBACK_TO_EMAIL` as a new hook setting. Keep limits/auth; fail safely without mail config.                                                  |
| `RESEND_API_KEY`                                                                                                   | Optional legacy Node feedback only; remove from basic quick-start requirements. PocketBase's configured mail client is the active app feedback route. Document generic SMTP, local test mail, and sender verification separately.                                           |
| `POCKETBASE_*`, `LOCAL_POCKETBASE_*` admin/test credentials                                                        | Server/tooling only. Consolidate duplicated templates around local fake credentials. No production URL, account, token, or admin password in committed examples. Defaults for destructive/seed tooling must be loopback and require explicit safe target checks.            |
| Apple configuration and proposed AASA app-ID allowlist                                                             | Document out-of-band secret file provisioning and empty/default-disabled integration. Remove fixed team/bundle identity from both hook and hosting AASA responses. Public app identifiers are not secret, but must not imply affiliation.                                   |
| `SPACEFAST_*`, `BLOG_*`, `SYNTHETIC_API_KEY`                                                                       | Remove from core environment requirements. Spacefast deployment belongs to optional ops; blog/reviewer variables do not belong in the public quick start.                                                                                                                   |

### URL replacement rules

1. Replace runtime `organizedglitter.app` canonical/self links with configured
   origin or relative routes. A human-readable README link to the official app
   may remain, clearly marked as the official hosted service.
2. Replace `data.organizedglitter.app` runtime/network/CSP/image matching with the
   configured backend's parsed origin. Prefer exact origin checks to substring
   matching. Tests use loopback or reserved `.test` examples.
3. Replace `contact@organizedglitter.app`, `support@organizedglitter.app`, and
   `accounts@organizedglitter.app` with operator contact/sender configuration.
   Legal pages and pre-React error shells need the same treatment as React pages.
4. Replace `updates.organizedglitter.app` with optional external updates config,
   or drop its consumers when blog functionality is removed. Remove production
   image proxy origins/wildcards from CSP; derive narrow allowed origins from
   configured services. Do not loosen CSP to make extraction pass.
5. `src/pages/coloringBookNavigation.ts` uses the official origin as a parser
   anchor, and `src/components/notes/markdown-url.ts` uses it as an SSR fallback.
   Replace these with a neutral `.invalid` parsing origin or validated local
   origin while preserving rejection of external `returnTo` values. Do not turn
   the origin replacement into an open redirect.
6. Bootstrap/fixture safety checks may retain an explicitly labeled official-host
   deny case, but must also reject arbitrary remote targets. Replace seed-script
   production examples with loopback; publish no instructions to seed production.
7. Replace production hosts in test fixtures/assertions with reserved `.test`
   hosts and test the configured-origin behavior. Preserve security regressions.
8. Archive/exclude files are not rewritten in place in this task; they disappear
   from the target copy. Section 5's inventory records those occurrences too.

### Exhaustive tracked-reference inventory

The appendix below lists every tracked text file containing the literal
`organizedglitter.app`, including its subdomains and mail addresses, at the
pinned commit. Each line number is a source occurrence to resolve; multiple
matches on one line share the action. Binary image contents, ignored secret
files, and Git history are intentionally outside this text inventory. The
manifest's own explanatory mentions are not cleanup targets.

| Source path                                                   | Matching source lines                                                 | Action                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/e2e/SKILL.md`                                 | 14, 35                                                                | Exclude from public copy.                                                                                      |
| `.env.example`                                                | 17, 18                                                                | Sanitize origins/recipient values to loopback or reserved examples; optional server mail.                      |
| `.github/workflows/blog-content-refresh.yml`                  | 46, 47, 48                                                            | Exclude from public copy.                                                                                      |
| `.github/workflows/ci.yml`                                    | 207, 216                                                              | Move deployment job/workflow to optional ops; explicit operator backend/site origin.                           |
| `.github/workflows/spacefast-preview.yml`                     | 40                                                                    | Move deployment job/workflow to optional ops; explicit operator backend/site origin.                           |
| `.github/workflows/spacefast-production-candidate.yml`        | 44, 45                                                                | Move deployment job/workflow to optional ops; explicit operator backend/site origin.                           |
| `README.md`                                                   | 8                                                                     | Keep only labeled official-service link; rewrite setup/source links.                                           |
| `about.html`                                                  | 11, 22, 26, 43, 160                                                   | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `api/send-feedback.js`                                        | 13, 14, 20, 21, 446, 447                                              | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `api/send-feedback.test.js`                                   | 20, 206, 215, 233, 234, 241, 242, 252, 253                            | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `blog/astro.config.mjs`                                       | 4                                                                     | Exclude from public copy.                                                                                      |
| `blog/src/components/Subscribe.astro`                         | 4                                                                     | Exclude from public copy.                                                                                      |
| `blog/src/layouts/BlogLayout.astro`                           | 17, 21                                                                | Exclude from public copy.                                                                                      |
| `blog/src/lib/content.mjs`                                    | 43                                                                    | Exclude from public copy.                                                                                      |
| `blog/src/lib/wordpress.mjs`                                  | 4                                                                     | Exclude from public copy.                                                                                      |
| `blog/src/pages/sitemap.xml.js`                               | 3                                                                     | Exclude from public copy.                                                                                      |
| `blog/test/content.test.mjs`                                  | 8, 141                                                                | Exclude from public copy.                                                                                      |
| `docs/adr/0001-pocketbase-cost-and-platform.md`               | 22                                                                    | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `docs/adr/0009-pocketbase-on-pikapods.md`                     | 14, 46                                                                | Exclude from public copy.                                                                                      |
| `docs/adr/0014-agpl-license.md`                               | 13                                                                    | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `docs/agents/ci.md`                                           | 81, 82, 122                                                           | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `docs/astro-blog.md`                                          | 45, 120                                                               | Exclude from public copy.                                                                                      |
| `docs/audits/preview-e2e-verification-2026-09-09.md`          | 4, 21, 32                                                             | Exclude from public copy.                                                                                      |
| `docs/audits/spacefast-feedback-ip-2026-09-24.md`             | 74                                                                    | Exclude from public copy.                                                                                      |
| `docs/audits/spacefast-preview-validation-2026-09-24.md`      | 7, 50, 56, 156                                                        | Exclude from public copy.                                                                                      |
| `docs/feature-inventory.csv`                                  | 127                                                                   | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `docs/mobile/password-reset-links.md`                         | 12, 47, 51                                                            | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `docs/native-ios/oauth-callback.md`                           | 16, 17                                                                | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `docs/railway-deployment.md`                                  | 14, 126, 137, 138, 153, 355, 359, 367, 370                            | Exclude from public copy.                                                                                      |
| `docs/reviews/code-review-2026-06-12.html`                    | 421, 446, 450                                                         | Exclude from public copy.                                                                                      |
| `docs/spacefast-cutover.md`                                   | 4, 10, 11, 56, 57, 81, 83, 92, 102, 118, 126, 149, 165                | Exclude from public copy.                                                                                      |
| `docs/spacefast-feedback.md`                                  | 4                                                                     | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `e2e/RUNNING-AGAINST-PREVIEW.md`                              | 47                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `e2e/blog.spec.ts`                                            | 4, 42, 496, 511, 530                                                  | Exclude from public copy.                                                                                      |
| `e2e/blog/wordpress-fixture.mjs`                              | 14, 21                                                                | Exclude from public copy.                                                                                      |
| `e2e/page-titles.spec.ts`                                     | 88                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `e2e/pwa-navigation.spec.ts`                                  | 51                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `index.html`                                                  | 11, 84, 92, 106, 130, 142, 162, 169, 177, 188, 189, 194, 196, 259     | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `links.html`                                                  | 11, 21, 25, 42, 159                                                   | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `package.json`                                                | 27, 30                                                                | Use public repository URL; homepage/author URL may identify official project, never runtime config.            |
| `pb_hooks/feedback.pb.js`                                     | 110                                                                   | Server-configured recipient, disabled safely when absent.                                                      |
| `pb_hooks/feedback.test.js`                                   | 73                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `privacy.html`                                                | 11, 21, 25, 42, 159                                                   | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `public/_headers`                                             | 3                                                                     | Generate narrow CSP/backend origins from config; remove blog/payment/private image-host assumptions.           |
| `public/js/bootstrap-analytics.js`                            | 148                                                                   | Configured analytics/site policy; no capture or official-host special case by default.                         |
| `public/robots.txt`                                           | 88                                                                    | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `public/sitemap.xml`                                          | 4, 9, 14, 19, 24                                                      | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `scripts/README.md`                                           | 204, 220                                                              | Rewrite portable docs/examples using local or operator-configured origins; remove private service assumptions. |
| `scripts/__tests__/assemble-blog.test.mjs`                    | 22, 32, 55, 56, 57                                                    | Exclude from public copy.                                                                                      |
| `scripts/assemble-blog.mjs`                                   | 4                                                                     | Exclude from public copy.                                                                                      |
| `scripts/bootstrap-local-pocketbase.mjs`                      | 107                                                                   | Keep labeled deny case if useful; additionally block all nonlocal destructive targets.                         |
| `scripts/run-blog-qa.mjs`                                     | 15                                                                    | Exclude from public copy.                                                                                      |
| `scripts/seed-e2e-coloring-fixture.mjs`                       | 15                                                                    | Replace production target examples with loopback; preserve local-only safeguards.                              |
| `scripts/seed-e2e-randomizer-fixture.mjs`                     | 15                                                                    | Replace production target examples with loopback; preserve local-only safeguards.                              |
| `server/local-build-server.js`                                | 26                                                                    | Generate narrow CSP/backend origins from config; remove blog/payment/private image-host assumptions.           |
| `server/local-build-server.test.js`                           | 104, 294, 296, 301, 307, 313, 518, 560, 582, 602, 626, 630, 1178      | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `server/spacefast-routing.test.js`                            | 14                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `spacefast/posthog.test.js`                                   | 13, 34, 46, 56, 63, 80, 88                                            | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/__tests__/unit/App.test.tsx`                             | 148                                                                   | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/__tests__/FeedbackDialog.test.tsx`            | 19, 72, 82, 84, 86                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/error/ComponentErrorBoundaries.tsx`           | 352                                                                   | Central configured operator contact/sender/origin; no official-account default.                                |
| `src/components/error/RouteErrorBoundary.tsx`                 | 9                                                                     | Central configured operator contact/sender/origin; no official-account default.                                |
| `src/components/error/__tests__/RouteErrorBoundary.test.tsx`  | 109                                                                   | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/layout/__tests__/AuthMenu.test.tsx`           | 81                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/layout/__tests__/MobileAccountMenu.test.tsx`  | 133                                                                   | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/layout/__tests__/SiteFooter.test.tsx`         | 26                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/notes/markdown-url.ts`                        | 12                                                                    | Neutral parsing origin; preserve external-redirect/URL safety checks.                                          |
| `src/components/projects/IncompatibleImageDialog.tsx`         | 12                                                                    | Central configured operator contact/sender/origin; no official-account default.                                |
| `src/components/projects/__tests__/ImageGallery.test.tsx`     | 118                                                                   | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/components/ui/page-loading.tsx`                          | 8                                                                     | Central configured operator contact/sender/origin; no official-account default.                                |
| `src/constants/__tests__/updates.test.ts`                     | 15, 16                                                                | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/constants/updates.ts`                                    | 4                                                                     | Optional configured updates URL; hide links when absent.                                                       |
| `src/hooks/__tests__/usePageMetadata.test.tsx`                | 57, 65, 68, 86, 106                                                   | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/lib/__tests__/feedback-email-service.test.ts`            | 13, 56, 63, 96, 111, 133, 148, 185, 213, 248, 272, 303, 317, 336, 350 | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/lib/__tests__/pocketbase.test.ts`                        | 82, 86, 263, 332, 429                                                 | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/lib/feedback-email-service.ts`                           | 77                                                                    | Central configured operator contact/sender/origin; no official-account default.                                |
| `src/lib/pocketbaseConfig.ts`                                 | 2                                                                     | Remove official backend fallback; loopback dev, required production configuration.                             |
| `src/lib/publicPageSocialMetadata.ts`                         | 1                                                                     | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `src/pages/About.tsx`                                         | 12, 16, 75                                                            | Configured canonical/contact/sender/updates values; genericize legal/personal copy.                            |
| `src/pages/EmailConfirmation.tsx`                             | 126                                                                   | Configured canonical/contact/sender/updates values; genericize legal/personal copy.                            |
| `src/pages/Home.tsx`                                          | 16, 20                                                                | Configured canonical/contact/sender/updates values; genericize legal/personal copy.                            |
| `src/pages/LinksPage.tsx`                                     | 16, 20, 43, 89, 94                                                    | Generic resources, configured origin/social metadata; remove personal/affiliate entries.                       |
| `src/pages/Privacy.tsx`                                       | 10, 14, 170, 173                                                      | Configured canonical/contact/sender/updates values; genericize legal/personal copy.                            |
| `src/pages/SupportSuccess.tsx`                                | 62                                                                    | Optional configured support/contact; remove unconditional payment success assertion.                           |
| `src/pages/Terms.tsx`                                         | 172, 247, 250, 262, 266                                               | Configured canonical/contact/sender/updates values; genericize legal/personal copy.                            |
| `src/pages/__tests__/LinksPage.test.tsx`                      | 38, 79, 82                                                            | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/pages/coloringBookNavigation.ts`                         | 6, 7                                                                  | Neutral parsing origin; preserve external-redirect/URL safety checks.                                          |
| `src/services/pocketbase/base/listAllPages.ts`                | 80                                                                    | Central configured operator contact; no official inbox in limit errors.                                        |
| `src/services/pocketbase/base/__tests__/listAllPages.test.ts` | 214                                                                   | Reserved .test/loopback fixtures or configured-contact assertions; preserve negative safety cases.             |
| `src/utils/error/__tests__/exceptionContext.test.ts`          | 142                                                                   | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `src/utils/error/fatalErrorHandler.ts`                        | 322                                                                   | Central configured operator contact/sender/origin; no official-account default.                                |
| `src/utils/error/resourceErrorTracking.ts`                    | 73, 144                                                               | Compare parsed configured backend origin; preserve redaction.                                                  |
| `terms.html`                                                  | 11, 21, 25, 42, 159                                                   | Build configured canonical/social/sitemap/contact values; rewrite personal/legal text.                         |
| `test/loading-script.test.ts`                                 | 65                                                                    | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |
| `test/local-safety.test.ts`                                   | 11, 27, 33, 48                                                        | Reserved .test/loopback fixtures or configured-origin assertions; preserve negative safety cases.              |

Reproduce this inventory with a tracked-file script that decodes text and checks
`organizedglitter.app` on each line. Do not rely on default ignore-aware `rg`.
Also search the extracted staged tree for old repository URLs, personal/affiliate
links, PayPal button IDs, Apple app IDs, production image proxies, PostHog project
identifiers, sender addresses, and retired provider names. URL cleanup does not
constitute a secret scan.

## 6. CI matrix

Keep public PR checks reproducible with no production credentials. Replace
`blacksmith-4vcpu-ubuntu-2404` with a supported public runner such as
`ubuntu-24.04`, unless a documented optional runner integration is chosen.
Keep pinned actions and minimal permissions. Public PR jobs use `pull_request`;
never execute fork code with secrets via `pull_request_target`.

| Workflow / every current job                                        | Public repo                                                                                                                                                                                                         | Optional ops / removal                                                                                                                                                                                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`: `static-checks`                         | Keep typecheck, format, lint, PB boundary, workflow lint.                                                                                                                                                           | Rewrite script expectations for excluded files.                                                                                                                                                                                                 |
| `ci.yml`: `unit-tests`                                              | Keep existing app/backend/tool unit tests.                                                                                                                                                                          | Remove `pnpm test:blog` from `test:ci:unit`.                                                                                                                                                                                                    |
| `ci.yml`: `backend`                                                 | Keep schema/migration, disposable upgrade, protected files, auth verification, feedback, step-up, fake native Apple, archive v3 tests. Add existing mobile-sync and AASA contract tests to the public backend gate. | No live provider credentials or production migration/upload. Fresh first commit has no private base history; skip cross-revision upgrade only for that bootstrap and still validate fresh install. Future upgrades compare public base commits. |
| `ci.yml`: `build`                                                   | Keep Vite build and bundle budget; produce test artifact.                                                                                                                                                           | Remove automatic blog build and sourcemap upload.                                                                                                                                                                                               |
| `ci.yml`: `browser`                                                 | Keep local Chromium/WebKit, not-found, PWA, QA smoke, and protected-file rotation. Keep repeatable reports under `.tmp/pocketbase-release-qa/`.                                                                     | Remove `qa:blog`; publish reports/traces only, not database/auth state/private feedback.                                                                                                                                                        |
| `ci.yml`: `react-doctor`                                            | Keep code-quality check with telemetry disabled.                                                                                                                                                                    | No private reviewer/provider required.                                                                                                                                                                                                          |
| `ci.yml`: `result`                                                  | Keep aggregate gate; update `scripts/ci-result.mjs` for retained jobs.                                                                                                                                              | Do not make deployment part of required public PR checks.                                                                                                                                                                                       |
| `ci.yml`: `deploy-spacefast`                                        | Remove from public core CI.                                                                                                                                                                                         | Optional ops consumes pinned public commit/artifact and enforces deployment-owner, exact-SHA, approval, and non-cancelling deployment concurrency.                                                                                              |
| `.github/workflows/dependency-security.yml`: `audit`                | Keep scheduled/manual dependency audit and diagnostic artifact.                                                                                                                                                     | Review inherited vulnerability exceptions; this is not proof of history safety.                                                                                                                                                                 |
| `.github/workflows/playwright-smoke.yml`: `browser`                 | Keep full local Chromium/WebKit validation, scheduled/manual and release PR.                                                                                                                                        | Despite “production browser flows” step wording, command is the local QA harness; rename wording and remove private host assumptions.                                                                                                           |
| `.github/workflows/pr-size.yml`: `label`                            | Keep optional GitHub label-only automation.                                                                                                                                                                         | Retain trusted-base checkout and metadata-only behavior; do not execute PR code with write permissions.                                                                                                                                         |
| `.github/workflows/spacefast-preview.yml`: `publish`                | Exclude from default public CI.                                                                                                                                                                                     | Optional ops preview with its own backend/analytics config, not hardcoded official backend.                                                                                                                                                     |
| `.github/workflows/spacefast-production-candidate.yml`: `candidate` | Exclude.                                                                                                                                                                                                            | Optional ops candidate verification/promotion with explicit deployment credentials and protected environment.                                                                                                                                   |
| `.github/workflows/blog-content-refresh.yml`: `candidate`           | Exclude.                                                                                                                                                                                                            | Separate content/ops workflow if blog retained operationally.                                                                                                                                                                                   |
| `.github/workflows/opencode.yml`: `authorize`, `review`             | Exclude.                                                                                                                                                                                                            | Optional reviewer tooling with explicit budget and trusted-base/fork security review.                                                                                                                                                           |
| `.github/workflows/opencode-review.yml`: `authorize`, `review`      | Exclude.                                                                                                                                                                                                            | Same provider-specific optional tooling; no public contribution gate.                                                                                                                                                                           |
| `.github/workflows/opencode-synchronize-reminder.yml`: `remind`     | Exclude.                                                                                                                                                                                                            | Remove stale reviewer reminders from public PRs.                                                                                                                                                                                                |

Copy `.github/actions/setup-project/action.yml`, `.github/dependabot.yml`,
`.github/actionlint.yaml`, and a rewritten `.github/pull_request_template.md`.
Trim workflow-lint allowlists and path filters to match the public workflows.
No workflow may depend on private repo history, Linear access, Obsidian, personal
skills, or official deployment secrets. Optional adapter scripts stay documented
and testable in public even when their deployment orchestration is elsewhere.

## 7. `.gitignore` simplification plan

Replace the current accumulated file whitelist with ordinary source tracking.
Remove the `pb_hooks/`, `pb_hooks/*`, `pb_migrations/`, `pb_migrations/*`, and
`scripts/*` ignores and all their file-by-file exceptions. New reviewed hooks,
migrations, helpers, and script tests must track normally.

Ignore concrete generated/private directories and file types:

```gitignore
node_modules/
dist/
dev-dist/
coverage/
.tmp/
.cache/
*.log
*.tsbuildinfo
.env
.env.*
!.env.example
local-pb-db/
pb_data/
/pocketbase
backups/
**/apple-auth-private/
*.p8
*.pem
*.key
*.db
*.db-*
*.sqlite
*.sqlite-*
*.dump
.pocketbase-schema.config.ts
e2e/.auth/
playwright-report/
test-results/
playwright-artifacts/
.spacefast/
/.spacefast-*
.DS_Store
.worktrees/
```

This is the starting policy, not a replacement applied by this manifest. Add
only generated/runtime directories still used in the extracted tree. Keep
`env.template` tracked if retained; remove its stale exception spelling
(`!.env.template` currently describes another filename). Do not blanket-ignore
names containing `secret`, `credential`, or `password`: that hides legitimate
security tests and does not protect already tracked files. Use secret scanning
and explicit private-data directories. Remove duplicate rules, deleted-provider
rules, named completion reports, personal skill/editor exceptions, and root
`/*.png` suppression. Keep source/generated app assets tracked intentionally.

Validate with `git check-ignore --no-index` on representative included paths
(new hook/helper/migration/script/test/schema/icon) and secret/runtime paths.
Review every staged path with `git diff --cached --name-only`; normal tracking
must not accidentally stage local databases, private keys, or auth fixtures.

## 8. Documentation to trim or rewrite

“Archive” below means retain in the existing private historical repository,
not copy into `organized-glitter-web/docs/archive/`.

| Root doc                   | Decision                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                | Rewrite for `organized-glitter-web`: local PocketBase-first setup, feature overview, public repo/source link, independent hosting, license and optional services. Remove personal badges, retired Railway text, and private workflow links. Official hosted app link may remain as attribution. |
| `AGENTS.md`                | Replace with concise public repo map/checks/code rules. No vault writing, personal CLI/host paths, Linear-only gate, agent skills, or paid reviewer mandate.                                                                                                                                    |
| `CONTEXT.md`, `PRODUCT.md` | Keep and trim private roadmap/operational references. Describe shipped craft behavior and free core.                                                                                                                                                                                            |
| `DESIGN.md`, `DESIGN.json` | Keep approved visual identity and tokens. Trim private preview links; preserve image/font licensing boundaries.                                                                                                                                                                                 |
| `NOTICE`                   | Keep and reconcile license wording; distinguish software from third-party art/fonts.                                                                                                                                                                                                            |

Retain these exact documentation paths, rewriting local setup, origin examples,
links, and private tracker references as necessary:

```text
docs/README.md
docs/codebase/README.md
docs/API_CONTRACT.md
docs/FILE_ACCESS_CONTRACT.md
docs/color-codes-and-swatches.md
docs/coloring-book-form-workflow.md
docs/coloring-book-save-workflow.md
docs/coloring-books.md
docs/coloring-search-hydration.md
docs/import-export.md
docs/lifecycle-date-status.md
docs/logging.md
docs/pocketbase-coloring-medium-ownership-hook.md
docs/pocketbase-dashboard-settings-hook.md
docs/pocketbase-typegen.md
docs/project-mutation-architecture.md
docs/stats-spec.md
docs/tag-keyboard-selection.md
docs/testing-playwright.md
docs/schema/collections.md
docs/pocketbase/README.md
docs/pocketbase/hooks.md
docs/pocketbase/local-development.md
docs/pocketbase/archive-restore-performance.md
docs/pocketbase/mobile-sync.md
docs/pocketbase/apple-auth-configuration.md
docs/pocketbase/apple-auth-config.example.json
docs/analytics/posthog.md
docs/design-system/overview.md
docs/design-system/glass.md
docs/design-system/app-icon.md
docs/design-system/marketing-photos.md
docs/icons/app-icon-source.png
docs/icons/app-icon-1024.png
docs/icons/Caveat-OFL.txt
docs/mobile/password-reset-links.md
docs/native-ios/oauth-callback.md
docs/test-data/
docs/oss-extraction-manifest.md
```

Review `docs/test-data/` and E2E import fixtures for personal records and artwork
rights; retain only synthetic examples. Retain `docs/feature-inventory.csv`
after removing private tracker IDs, production test anecdotes, internal host
names, and mailbox references; mark planned features clearly.
Exclude unlisted docs, including design-system HTML experiments. Rewrite
`docs/spacefast-routing.md`, `docs/spacefast-feedback.md`, and
`docs/spacefast-posthog.md` as optional portable adapter documentation; remove
cutover chronology, real service identifiers, and operator-specific instructions.

Sanitized exceptions to `docs/agents/` exclusion:
`code-conventions.md`, `backend-environment-safety.md`, `ci.md`, `domain.md`,
`main-branch-protection.md`. Keep portable contributor/security rules only.
Move policy summaries into `CONTRIBUTING.md`/`SECURITY.md` where clearer.
Exclude all other files in that directory; security exceptions need individual
review before any justified generic replacement is published.

### Every ADR

| ADR path under `docs/adr/`                          | Decision                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`, `0000-template.md`                     | Keep; rebuild index for retained records, preserve numbers and intentional gaps.                                                                                                     |
| `0001-pocketbase-cost-and-platform.md`              | Rewrite as PocketBase choice/local schema rationale; remove private costing and actual backend host.                                                                                 |
| `0002-expo-repo-and-package-structure.md`           | Archive; superseded Expo packaging.                                                                                                                                                  |
| `0003-client-rendered-spa.md`                       | Keep.                                                                                                                                                                                |
| `0004-react-query-server-state.md`                  | Keep.                                                                                                                                                                                |
| `0005-pocketbase-access-boundary.md`                | Keep.                                                                                                                                                                                |
| `0006-no-realtime-last-write-wins.md`               | Rewrite to match current revision/stale-write and sync behavior; do not present historical last-write-wins as the whole contract.                                                    |
| `0007-auth-providers-and-token-model.md`            | Keep and rewrite optional provider/local auth setup.                                                                                                                                 |
| `0008-railway-web-hosting.md`                       | Archive; retired platform.                                                                                                                                                           |
| `0009-pocketbase-on-pikapods.md`                    | Archive provider-specific operations; retain generic PocketBase hosting/backup needs in setup docs.                                                                                  |
| `0010-backend-logic-placement.md`                   | Keep.                                                                                                                                                                                |
| `0011-pwa-first-native-undecided.md`                | Archive; native now has its own public repository.                                                                                                                                   |
| `0012-app-owned-design-system.md`                   | Keep.                                                                                                                                                                                |
| `0013-testing-bar-and-a11y-gate.md`                 | Keep; make gates public and reproducible.                                                                                                                                            |
| `0014-agpl-license.md`                              | Rewrite target repo/source-offer URL and agreed license variant.                                                                                                                     |
| `0015-posthog-analytics.md`                         | Keep and rewrite as optional analytics with explicit privacy and configuration boundaries.                                                                                           |
| `0016-resend-transactional-email.md`                | Rewrite to current PocketBase-mail contract and optional Resend transport/legacy adapter; no mandatory provider.                                                                     |
| `0017-dev-main-release-flow.md`                     | Keep if retaining dev/main policy; remove private service gates.                                                                                                                     |
| `0018-tiptap-rich-text-notes.md`                    | Keep.                                                                                                                                                                                |
| `0019-client-side-image-pipeline.md`                | Keep.                                                                                                                                                                                |
| `0020-native-swiftui-app-in-separate-repository.md` | Keep; rewrite stale "private repository" wording. Link the public native repo and Apache license; explain shared backend boundary.                                                   |
| `0021-diamond-catalog-supporter-and-tips.md`        | Archive; superseded subscription/allowance direction, not a feature to recreate.                                                                                                     |
| `0022-free-catalog-and-optional-tips.md`            | Rewrite free-core/no-tip-entitlement policy; clearly label catalog as future work and native purchase setup as outside web extraction. Remove private launch/issues dependency list. |

Rebuild docs indices and relative links after exclusions. A copied document must
not instruct a contributor to open a private issue, read a removed runbook, access
a personal vault, or configure production before running locally.

## 9. Risk register

| Risk                                                 | Impact   | Mitigation / required evidence before publication                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets or private data in Git history               | Critical | Prefer a new root commit from reviewed files, not a mirror, fork, or history push. Scan the staged tree and release artifact with a secret scanner; scan source history separately before any history transfer. Check tags, LFS objects, attachments, comments, and generated bundles. Rotate confirmed exposed credentials. No secret/history clearance is claimed here. |
| Current ignored files and auth state                 | Critical | Copy tracked files only. Inspect staging and outputs. Keep `.env.*`, `e2e/.auth`, private Apple configuration, grants, backups, and database/user files out. Ignore rules alone do not protect tracked content.                                                                                                                                                           |
| Apple private config and grants                      | Critical | Public configuration reader/helpers are fine; signing keys and grant-encryption keys are not. Validate missing-config readiness, synthetic test keys, backup exclusions, fail-closed auth, and grant revocation without printing secret values. Provision deployment identities separately.                                                                               |
| Accidental official backend/mail/payment traffic     | High     | Remove live fallbacks and hardcoded sender/recipient/PayPal identity. Boot clone with optional services absent; record requests and prove no official-host or payment calls. Keep seed/admin scripts restricted to local targets.                                                                                                                                         |
| Schema/migration extraction incomplete               | High     | Full schema is the empty-instance baseline; incremental migrations and archived history are different. Document baseline/migration bookkeeping and verify bootstrap, second start, and a future migration do not reapply destructive changes. Keep rules/indexes/generated types consistent.                                                                              |
| PostHog coupling and privacy                         | High     | Analytics off without config, including pre-React bootstrap and proxy. Explicit configured project/host only; retain sensitive-content redaction and privacy controls. Sourcemap upload optional; no private API key or production project ID in examples/artifacts.                                                                                                      |
| Resend/mail coupling                                 | High     | Core feedback uses PocketBase mail; legacy Node adapter imports remain deliberate. No API key required to build/start. Use disposable test mail/provider fakes and preserve escaping, verified auth, rate limits, limits, and delivery-failure reporting.                                                                                                                 |
| Third-party artwork, photos, chibi, icons, and fonts | High     | Existing attribution is not proof of redistribution rights. Inventory all retained assets and fixture images with license/permission evidence. Remove or use approved replacements for blockers. Preserve copyright/OFL/font notices and the approved product identity.                                                                                                   |
| AGPL variant/source offer and native boundary        | High     | Reconcile AGPL-3.0 request with current or-later notices and add full LICENSE. Record provenance/copyright, dependencies, and asset licenses. Hosted operator must provide the corresponding deployed source as required by the chosen license. Do not relicense/copy the native app.                                                                                     |
| Privileged public CI or private runner dependencies  | High     | Use public runners, read-only fork PR checks, pinned actions, local fake providers, and safe artifact paths. Review label-only `pull_request_target` separately; remove secret-backed AI review jobs.                                                                                                                                                                     |
| Private ops becomes a second application source      | Medium   | Ops checks out pinned public web commits; fixes to app/backend/adapters land publicly. Do not retain app patches or a permanent private web fork.                                                                                                                                                                                                                         |
| Personal/business copy and broken excluded imports   | Medium   | Genericize Links/About/support/legal surfaces and all related route/build/test references. Scan missing imports/scripts/docs links; test all retained public and authenticated routes.                                                                                                                                                                                    |

## 10. Acceptance criteria

### Manifest completeness gate

- [x] Required repo docs were read and inventory anchored to branch/date/commit.
- [x] Exact copy sets and exclusion precedence are written down, including tests,
      helpers, assets, schema, migrations, tooling, and new root docs.
- [x] Every current `.pb.js` hook has an explicit decision; helper dependencies
      and private Apple configuration are distinguished.
- [x] Every current workflow/job has a public, optional-ops, or removal decision.
- [x] Every tracked text occurrence of the requested production domain/mail
      family is listed by path/line with an action.
- [x] Links/About/support/legal/catalog-curator/native boundaries are decided;
      missing curator implementation is recorded rather than invented.
- [x] Root docs and every ADR have a disposition; historical archives remain
      outside the public target.
- [x] Normal source tracking replaces whitelist ignore patterns in the plan.
- [x] Risks and bootstrap gates below are explicit. No permanent private app fork
      is planned; no extraction/deployment is claimed complete.

### Bootstrap and publication gate (future work)

- [ ] Refresh inventories against the selected extraction SHA (currently
      `647ecd9bdbdfffa37c693e914f06a3ba39fead41` on the manifest branch). Expand
      copy sets into a machine-readable path manifest; each tracked source path is
      included, rewritten, or excluded, and all retained transitive imports/resources
      resolve (`scripts/fixtures/`, Apple test-support helpers, and non-blog Vite
      inputs included).
- [ ] Copyright holder resolves AGPL variant; full LICENSE, `BRAND.md`, notices,
      dependency licenses, asset rights, and deployed-source link are consistent.
- [ ] Asset inventory complete for retained `public/images/`, marketing photos,
      icon sources, and `docs/test-data/` fixtures, with license or permission
      evidence recorded before public launch.
- [ ] Stage only reviewed source in a new repository with fresh history; record
      secret-scan and asset-review evidence before making it public. Do not push the
      private repo's commits, tags, runtime data, or credentials.
- [ ] A clean clone with Node 24/pnpm 11.1.2 and PocketBase 0.40.1 installs via
      frozen lockfile, bootstraps synthetic local data, and restarts successfully.
- [ ] Default build/typecheck/lint/format/PB boundary/schema/migration/unit checks
      succeed with no official service credentials, blog project, or review provider.
- [ ] Validate fresh schema plus migration bookkeeping and public-base upgrade
      behavior. Test ownership, verified auth, deletion, stale writes, relation guards,
      files, archive restore, feedback, AASA, and shared mobile/native endpoints.
- [ ] Local Chromium and WebKit QA passes on kept public/authenticated/PWA flows.
      Record exact command, result, and report/trace path under
      `.tmp/pocketbase-release-qa/<run-id>/`; do not upload DB/auth state.
- [ ] Verify no default requests to official backend, telemetry, WordPress,
      payments, image proxies, or inbox destinations. Configured integrations work
      only when enabled; disabled integrations fail safely with useful UI.
- [ ] Public CI passes from an external fork without secrets/private runner access;
      branch protection requires only shipped public checks.
- [ ] Docs/package scripts/lockfile/route policies/CSP/metadata/sitemaps have no
      dangling excluded dependencies or unsafe broad origin permissions.
- [ ] Optional ops consumes a pinned public revision, stores credentials outside
      Git, and owns production mail/Apple/provider/deploy configuration. Production
      migration, domain cutover, deployment, and repository publication require their
      own explicit authorization; manifest approval does not perform those actions.
