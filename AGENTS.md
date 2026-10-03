# AGENTS.md

Concise map for contributors and automation working in this repository.

| Need              | Doc                                                                  |
| ----------------- | -------------------------------------------------------------------- |
| Where code lives  | [`docs/codebase/README.md`](./docs/codebase/README.md)               |
| Domain terms      | [`CONTEXT.md`](./CONTEXT.md)                                         |
| Product or UX     | [`PRODUCT.md`](./PRODUCT.md)                                         |
| Visual system     | [`DESIGN.md`](./DESIGN.md)                                           |
| UI implementation | [`docs/design-system/overview.md`](./docs/design-system/overview.md) |

## Stack

React + TypeScript + Vite with a PocketBase backend.

- pnpm 11.1.2 or newer. Node 24.x.
- `@/*` maps to `src/*`.
- Typecheck with `pnpm typecheck` only.
- Prettier with the Tailwind plugin. ESLint with TypeScript and React Hooks.
- Vitest, Testing Library, and Playwright.

## Boundaries

- `src/`: Vite web app only.
- Native SwiftUI app: separate repo `Interactive-Buffoonery/organized-glitter-app`.
- `api/`, `server/`: server-side adapters only. No secrets in `src/`.
- `pb_hooks/`, `pb_migrations/`: PocketBase backend source.
- `src/services/pocketbase/`: collection access and mutations.
- `src/hooks/queries/` and `src/hooks/mutations/`: React Query.

## Hard rules

- Feature branches target `dev`. Release PRs merge `dev` to `main`.
- Secrets stay server-side. Never commit `.env`, keys, dumps, or auth fixtures.
- Imperative commit messages. No emojis.
- No em dashes in product UI copy or repo documentation.

## Commands

| Area       | Commands                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Install    | `pnpm install`; clean reinstall: `pnpm setup`                                                    |
| App        | `pnpm dev:local`, `pnpm dev:lan`                                                                 |
| PocketBase | `pnpm pb:local`, `pnpm pb:bootstrap:local -- --seed`                                             |
| Checks     | `pnpm typecheck`, `pnpm lint`, `pnpm lint:pb-boundary`, `pnpm format:check`                      |
| Tests      | `pnpm test`; pre-PR: `pnpm test:pr`                                                              |
| Build      | `pnpm build`, `pnpm preview`                                                                     |
| PB types   | `pnpm pb:types`, `pnpm pb:types:local`, `pnpm pb:validate:schema`, `pnpm pb:validate:migrations` |

Local PocketBase: [`docs/pocketbase/local-development.md`](./docs/pocketbase/local-development.md).

## Code

Conventions: [`docs/agents/code-conventions.md`](./docs/agents/code-conventions.md).

- Keep derived values in selectors and memoized helpers, not extra state.
- Prefer app wrappers in `src/components/ui` over raw third-party primitives.
- Log with `createLogger('ModuleName')` from `@/utils/logger`.
- Surface async errors through notifications or error boundaries.
- Do not add `stores/` for server state.
- Write tests before the code they verify when adding new behavior.

## UI

Read `PRODUCT.md`, `DESIGN.md`, and design-system docs before UI work.

- Buttons need `type="button"` unless they submit or reset.
- Check mobile Safari for forms, editors, uploads, and PWA changes.

## Review checklist

Prioritize correctness, auth, privacy, cache invalidation, mobile behavior,
accessibility, and tests for behavior changes.
