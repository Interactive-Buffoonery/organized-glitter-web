# Organized Glitter documentation

Status-aware index for the repo docs. Repo-wide commands and agent rules live in
[`../AGENTS.md`](../AGENTS.md).

## Start here

| Doc                                          | Status        | Purpose                                                                                              |
| -------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| [`codebase/README.md`](./codebase/README.md) | Current       | `src/` layout, routing entry points, PocketBase services, `pb_*`, `api/`, tests, dead-code commands. |
| [`adr/README.md`](./adr/README.md)           | Current       | Stable architecture choices, including PocketBase and the separate native SwiftUI repository.        |
| [`audits/README.md`](./audits/README.md)     | Point-in-time | Tech-debt audits, audit refreshes, and findings that must be revalidated before implementation.      |

## Canonical references

- [`../CONTEXT.md`](../CONTEXT.md): domain glossary; use these terms in issues and code.
- [`../PRODUCT.md`](../PRODUCT.md): product register and commitments.
- [`../DESIGN.md`](../DESIGN.md): visual source of truth for product UI.
- [`schema/collections.md`](./schema/collections.md): PocketBase collection schema contract and access model.
- [`adr/0020-native-swiftui-app-in-separate-repository.md`](./adr/0020-native-swiftui-app-in-separate-repository.md):
  native SwiftUI app lives in a separate repository.
- [`adr/0022-free-catalog-and-optional-tips.md`](./adr/0022-free-catalog-and-optional-tips.md):
  free diamond catalog and optional one-time tips.
- [`native-ios/release-0a-pocketbase-evidence.md`](./native-ios/release-0a-pocketbase-evidence.md):
  current native launch evidence and blockers.

## Active contracts and workflows

- [`coloring-books.md`](./coloring-books.md): coloring book metadata, publisher/illustrator taxonomy, inline creation workflow.
- [`coloring-book-form-workflow.md`](./coloring-book-form-workflow.md): coloring book add/edit form flow, validation, persistence, test seams.
- [`coloring-book-save-workflow.md`](./coloring-book-save-workflow.md): save boundaries, tag sync, submit locking, cache invalidation.
- [`color-codes-and-swatches.md`](./color-codes-and-swatches.md): coloring page color references, swatch photos, notes, protected uploads, resumable archive restore, and local validation.
- [`coloring-search-hydration.md`](./coloring-search-hydration.md): search input interaction guard during saved-filter hydration on the coloring dashboard.
- [`project-mutation-architecture.md`](./project-mutation-architecture.md): diamond project commands/adapters layered mutation pattern, three-intent update model, field-change checklist.
- [`import-export.md`](./import-export.md): CSV, DAC CSV, guided bulk photo import, archive ZIP backup/restore, Shopify order-import limits, and future import helper direction.
- [`plans/url-kit-import.md`](./plans/url-kit-import.md): proposed paste-a-product-URL flow for adding a private diamond project.
- [`mobile/mobile-v1-scope.md`](./mobile/mobile-v1-scope.md): mobile v1 workflow-parity scope, navigation model, PWA alignment, and post-v1 timed-session decisions.
- [`adr/0007-auth-providers-and-token-model.md`](./adr/0007-auth-providers-and-token-model.md): auth provider, token, and error mapping decision (formerly `AUTH_CONTRACT.md`).
- [`API_CONTRACT.md`](./API_CONTRACT.md): PocketBase REST, filter, stats route, and error taxonomy contract.
- [`FILE_ACCESS_CONTRACT.md`](./FILE_ACCESS_CONTRACT.md): file field visibility and URL construction contract.
- [`adr/0006-no-realtime-last-write-wins.md`](./adr/0006-no-realtime-last-write-wins.md): realtime and conflict policy decision (formerly `REALTIME_POLICY.md`).
- [`schema/collections.md`](./schema/collections.md): PocketBase collection schema contract for mobile repositories.
- [`pocketbase-coloring-medium-ownership-hook.md`](./pocketbase-coloring-medium-ownership-hook.md): server-side authorization guard for coloring page medium relations.
- [`tag-keyboard-selection.md`](./tag-keyboard-selection.md): shared keyboard selection behavior for diamond and coloring book tag searches.
- [`analytics/posthog.md`](./analytics/posthog.md): PostHog analytics coverage, privacy rules, and event maintenance guidance.
- [`stats-spec.md`](./stats-spec.md): hook-backed stats API contract and metric definitions.
- [`testing-playwright.md`](./testing-playwright.md): Playwright and browser testing guidance.
- [`design-system/overview.md`](./design-system/overview.md): design-system source of truth and open decisions.
- [`design-system/glass.md`](./design-system/glass.md): glass and iOS-style surfaces.
- [`design-system/app-icon.md`](./design-system/app-icon.md): app icon design, PNG master, and regeneration workflow.
- [`design-system/marketing-photos.md`](./design-system/marketing-photos.md): homepage photography assets, cropping rules, and attribution.

## Current platform setup

- [`pocketbase/README.md`](./pocketbase/README.md): migration history, deployable migration guidance, coloring schema notes.
- [`pocketbase/local-development.md`](./pocketbase/local-development.md): local and Cursor Cloud PocketBase setup, seed data, troubleshooting.
- [`pocketbase/hooks.md`](./pocketbase/hooks.md): PocketBase JSVM hook testing, route-scope gotchas, and production upload cautions.
- [`pocketbase-typegen.md`](./pocketbase-typegen.md): explicit PocketBase type generation workflow.
- [`railway-deployment.md`](./railway-deployment.md): Railway preview/production setup, variables, CLI setup, agent setup, and validation.
- [`spacefast-cutover.md`](./spacefast-cutover.md): INT-1139 domain cutover gates, execution sequence, DNS safeguards, acceptance checks, and rollback.
- [`logging.md`](./logging.md): browser logger usage, redaction, production behavior.

## Agent workflow (issues, triage, domain)

- [`agents/ci.md`](./agents/ci.md): CI merge contract, job breakdown, and failure semantics.
- [`agents/issue-tracker.md`](./agents/issue-tracker.md)
- [`agents/triage-labels.md`](./agents/triage-labels.md)
- [`agents/domain.md`](./agents/domain.md)
- [`agents/main-branch-protection.md`](./agents/main-branch-protection.md)
- [`agents/opencode-review.md`](./agents/opencode-review.md)
- [`agents/code-conventions.md`](./agents/code-conventions.md)
- [`agents/cursor-bugbot.md`](./agents/cursor-bugbot.md)
- [`agents/skill-progression-map.md`](./agents/skill-progression-map.md): tracks which agent skills should deepen next, based on review feedback and fix patterns.

## Point-in-time references

These docs are useful evidence, not current implementation instructions. Recheck
against the live repo before turning any finding into work.

- [`audits/README.md`](./audits/README.md): reading order for tech-debt and codebase audits.
- [`CROSS_PLATFORM_PREP_PLAN.md`](./CROSS_PLATFORM_PREP_PLAN.md): mobile backend readiness plan.
- [`RULE_AUDIT.md`](./RULE_AUDIT.md): PocketBase access-rule audit.
- [`pocketbase-dashboard-settings-hook.md`](./pocketbase-dashboard-settings-hook.md): dashboard-settings hook implementation notes.

## Static previews and assets

Static previews under [`design-previews/`](./design-previews/) and [`design-system/*.html`](./design-system/) are reference artifacts, not app routes.

Examples in `design-previews/`:

- [`design-previews/berry-cream-tokens.html`](./design-previews/berry-cream-tokens.html): locked-palette specimen for Berry Cream Light and Berry Cream after dark (atmosphere, buttons, glass, chips, form chrome).
- [`design-previews/randomizer-directions/`](./design-previews/randomizer-directions/): three throwaway layout direction mockups archived after Sarah selected Wheel first.
- [`design-previews/coloring-swatch-flow/`](./design-previews/coloring-swatch-flow/): coloring page color reference concept mockup (swatch upload, viewer, notes, removal) with handoff notes.
- [`design-previews/dark-destructive-options.html`](./design-previews/dark-destructive-options.html): Dark mode destructive token options specimen comparing fill and text red variants.
- [`design-previews/scrapbook-mock.html`](./design-previews/scrapbook-mock.html) and [`design-previews/scrapbook-mock-all.html`](./design-previews/scrapbook-mock-all.html): marketing scrapbook layout mocks (New/Edit/Detail).
- [`design-previews/marketing-icons.html`](./design-previews/marketing-icons.html): marketing icon grid preview.

## Plans

In-flight engineering plans live in [`plans/`](./plans/). Keep this folder
small: only retain plans that still describe real, unfinished work. Delete
stale or completed plans after any useful guidance has moved into a canonical
doc, ADR, Linear issue, or shipped code. Git history is the archive.

- [`plans/url-kit-import.md`](./plans/url-kit-import.md): paste a shop product URL to prefill Add Project.
- [`plans/import-export-photo-archive-dac.md`](./plans/import-export-photo-archive-dac.md): Settings Data import/export branch notes.

## Maintenance

When adding or significantly changing documentation:

1. Add a **date or status** at the top when the doc is time-sensitive.
2. **Link it from this file** (or from `codebase/README.md` / `adr/README.md` if that is the better hub).
3. Delete superseded material after the current guidance has a new home.
4. Prefer **updating one canonical page** over duplicating long command lists in `AGENTS.md`.
