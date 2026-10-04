# Offline retry lifecycle (INT-1208)

Confirmed: the render-time write to `isCheckingRef` lets a suspended render
change the focus trap while the visible retry button is still enabled. The
regression keeps a connectivity-check transition suspended and presses Tab;
the old code moves focus to the dialog instead of the visible retry button.

Publish checking state in a layout effect so the trap reads committed state.
Keep the existing isolation, portal ownership, pending focus, and retry handler.

Failure modes covered before the fix: speculative pending state changes focus;
a committed pending check fails to disable retries; recovery loses interrupted
focus; nested modal ownership loses isolation. The latter three retain existing
coverage. A component test is required because a suspended React render cannot
be deterministically induced by a normal browser connectivity request.

Verification: `pnpm exec vitest run src/components/__tests__/OfflinePage.test.tsx`.
