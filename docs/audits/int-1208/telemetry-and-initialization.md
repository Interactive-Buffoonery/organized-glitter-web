# Telemetry and initialization lifecycle (INT-1208)

The four `renderGuards.ts` ref diagnostics are confirmed as one telemetry defect:
render-time counter increment, reset counter, reset timestamp, and warning
cooldown write count or log renders that never commit. StrictMode also counts
two renders for one commit. This produces misleading excess-render warnings.

Count and warn in a layout effect. A flag scoped to each effect closure avoids
double counting StrictMode setup replay. Keep the three-second reset window and
five-second warning cooldown. Consumers read `getRenderStats()` in their effects
after the counter updates. Do not use state to publish telemetry, because that
would schedule extra renders and contaminate the measurement.

Failure modes covered before the fix: suspended renders inflate counts and
consume warnings; StrictMode replay doubles counts; telemetry creates its own
render loop; reset windows or warning cooldowns change. Hook tests cover these
conditions. Existing dashboard tests cover both consumers' logging contract.

The `useAppInitialization` cleanup finding is a **false positive**. Its cleanup
already clears the reload timer, runs both helper cleanups, and removes the
exact `unhandledrejection` listener. Existing timer coverage and added StrictMode
setup/replay/unmount coverage pass without changing the hook. The test also
proves that dispatching a rejection after unmount schedules no reload. Do not
suppress the rule or rewrite working cleanup to satisfy the scanner.

Verification:

```sh
pnpm exec vitest run src/utils/query/__tests__/renderGuards.test.tsx src/hooks/__tests__/useDashboardTelemetry.test.tsx src/hooks/__tests__/useAppInitialization.test.tsx
pnpm test:ci:react
```

All ten diagnostics are classified across this directory: nine confirmed ref
findings and one cleanup false positive. No product decision is required.
