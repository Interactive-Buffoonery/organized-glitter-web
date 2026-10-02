# Code conventions

Coding style rules for Organized Glitter. `AGENTS.md` links here from the Code
section; keep both documents consistent when either changes.

## Naming

| Kind         | Convention                                                   | Example                            |
| ------------ | ------------------------------------------------------------ | ---------------------------------- |
| Components   | `PascalCase`                                                 | `GlassPanel`, `ProjectCard`        |
| Hooks        | `useThing`                                                   | `useAuth`, `useBulkPhotoImport`    |
| Files        | `kebab-case` or `camelCase`, matching the nearest convention | `glass-panel.tsx`, `useAuth.ts`    |
| Types        | `PascalCase`                                                 | `ProjectStatus`, `AppNotification` |
| Enum members | `UPPER_SNAKE_CASE`                                           | `IN_PROGRESS`, `COMPLETED`         |
| Booleans     | `is`, `has`, `should`, or `can` prefix                       | `isLoading`, `hasUnsavedChanges`   |

## Imports

- Group imports: **external** packages first, then **`@/`** aliased imports,
  then **relative** imports.
- Keep import order stable and let Prettier handle formatting.
- Do not import third-party primitives directly into product code when an
  app-owned wrapper exists in `src/components/ui`.

## TypeScript and React

- Use functional components and hooks. No class components.
- Prefer `type` for simple object shapes and `interface` when extending or
  declaring public contracts.
- Avoid `any`. Use narrow unions or generics.
- Prefer `const` and immutable updates.
- Use the `@/` path alias for imports from `src/`.
- Use Context7 when writing PocketBase code so docs and snippets match the
  current API.
- Add comments only when they explain non-obvious intent or constraints; do not
  narrate what code already says.

## Error handling

- Prefer early returns and guard clauses.
- Surface async errors through user-facing notifications or error boundaries.
- Do not throw raw errors from UI components. Wrap or convert to typed errors.
- Use `createLogger('ModuleName')` from `@/utils/logger` for diagnostics. Do
  not call `console.log` directly outside the logger.
- Import app notifications from `@/lib/notifications`, not directly from
  `sonner`.

## Tests

- Write tests before the code they verify. Never write unit tests after writing
  the code.
- Highly prefer E2E tests as the sole testing mechanism for complex features.
  Exercise real user flows and finish each run with a verifiable, repeatable
  artifact: the command, result, and Playwright report or trace path. The local
  browser QA runner writes these under `.tmp/pocketbase-release-qa/<run-id>/`.
- If isolation is necessary, write down every credible failure mode first,
  then write the test and the code. Keep isolated tests only when they catch a
  real bug that the E2E gate would miss.
- For retained UI tests, use Testing Library queries by role or label before
  `getByTestId`. Keep them deterministic, and mock PocketBase and network calls
  through existing test utilities when available.

## Agent behavioral rules

These apply to automated agents working in the repo:

- **Preserve unrelated worktree changes.** Do not revert or discard changes the
  user has staged or left in the working tree unless Sarah explicitly asks.
- **No `Co-Authored-By` trailers.** Omit co-author commit trailers.
- **Do not log secrets, tokens, credentials, passwords, or PII.** This rule
  also appears in `.cursor/BUGBOT.md` for review.
