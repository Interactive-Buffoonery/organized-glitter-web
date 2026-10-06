# Architecture Decision Records (ADRs)

Short, dated notes for decisions that should outlive a single PR or chat thread.

## When to add an ADR

Add one when a choice is **stable**, **cross-cutting**, and **costly to reverse** (stack, hosting, auth model, major data boundary). Skip ADRs for routine implementation details unless they encode a team rule.

## How to add

1. Copy [`0000-template.md`](./0000-template.md) to the next number, for example `0020-your-title.md`.
2. Fill **Context**, **Decision**, **Rejected Alternatives** (when real alternatives were weighed), and **Consequences**. Keep it one to three screens.
3. Add the ADR to the index below, and link it from [`../README.md`](../README.md) or [`../codebase/README.md`](../codebase/README.md) if it helps orientation.

## Index

| ID                                                          | Title                                                         | Status     |
| ----------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| [0001](./0001-pocketbase-cost-and-platform.md)              | Stay on PocketBase (cost and platform fit)                    | Accepted   |
| 0002 (historical reference outside this extraction)         | Keep web at root and add Expo app workspace                   | Superseded |
| [0003](./0003-client-rendered-spa.md)                       | Build the web app as a client-rendered SPA on Vite            | Accepted   |
| [0004](./0004-react-query-server-state.md)                  | Use React Query for server state, keep client state minimal   | Accepted   |
| [0005](./0005-pocketbase-access-boundary.md)                | Route all PocketBase access through a typed service layer     | Accepted   |
| [0006](./0006-no-realtime-last-write-wins.md)               | Ship without realtime; online-only writes, last-write-wins    | Accepted   |
| [0007](./0007-auth-providers-and-token-model.md)            | Authenticate with PocketBase auth: email/password and OAuth   | Accepted   |
| 0008 (historical reference outside this extraction)         | Host the web app on Railway behind a small Node server        | Superseded |
| 0009 (historical reference outside this extraction)         | Keep PocketBase hosted on PikaPods, separate from web hosting | Accepted   |
| [0010](./0010-backend-logic-placement.md)                   | Place backend logic in pb_hooks, api/ routes, or the server   | Accepted   |
| 0011 (historical reference outside this extraction)         | Stay PWA-first; leave the native mobile app undecided         | Superseded |
| [0012](./0012-app-owned-design-system.md)                   | Build an app-owned design system on Tailwind and Radix        | Accepted   |
| [0013](./0013-testing-bar-and-a11y-gate.md)                 | Gate PRs on typecheck, lint, unit tests, and accessibility    | Accepted   |
| [0014](./0014-agpl-license.md)                              | License the project AGPL-3.0-or-later                         | Accepted   |
| [0015](./0015-posthog-analytics.md)                         | Use PostHog for analytics, behind a first-party proxy         | Accepted   |
| [0016](./0016-resend-transactional-email.md)                | Send app email through Resend, server-side only               | Accepted   |
| [0017](./0017-dev-main-release-flow.md)                     | Land changes through feature branches to dev, release to main | Accepted   |
| [0018](./0018-tiptap-rich-text-notes.md)                    | Use TipTap for rich text notes, stored as Markdown            | Accepted   |
| [0019](./0019-client-side-image-pipeline.md)                | Process images client-side before uploading to PocketBase     | Accepted   |
| [0020](./0020-native-swiftui-app-in-separate-repository.md) | Build the native SwiftUI app in a separate repository         | Accepted   |
| 0021 (historical reference outside this extraction)         | Retired catalog plan                                          | Superseded |
| [0022](./0022-free-catalog-and-optional-tips.md)            | Keep the app free with website-only support                   | Accepted   |
