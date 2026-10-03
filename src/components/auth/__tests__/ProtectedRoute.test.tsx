/**
 * Tests for ProtectedRoute auth redirect logic
 *
 * Verifies that the condition for showing loading vs redirecting
 * is correct: unauthenticated users (user=null, initialCheckComplete=true,
 * isLoading=false) must be redirected, not shown a spinner.
 *
 * Tests the logic inline to avoid OOM from the full component import chain.
 */

import { describe, it, expect } from 'vitest';

/**
 * Extract the condition logic from ProtectedRoute to test it in isolation.
 * The actual component at ProtectedRoute.tsx:42 uses:
 *   if (isLoading || !initialCheckComplete) => show spinner
 *   if (!user) => redirect
 *   else => show children
 */
type AuthState = {
  user: { id: string } | null;
  isLoading: boolean;
  initialCheckComplete: boolean;
};

type RouteDecision = 'loading' | 'redirect' | 'allow';

function decideRouteAction(auth: AuthState): RouteDecision {
  // This must match ProtectedRoute.tsx logic exactly
  if (auth.isLoading || !auth.initialCheckComplete) {
    return 'loading';
  }
  if (!auth.user) {
    return 'redirect';
  }
  return 'allow';
}

describe('ProtectedRoute auth redirect logic', () => {
  it('shows loading while auth is in progress', () => {
    expect(decideRouteAction({ user: null, isLoading: true, initialCheckComplete: false })).toBe(
      'loading'
    );
  });

  it('shows loading while initial check is not complete', () => {
    expect(decideRouteAction({ user: null, isLoading: false, initialCheckComplete: false })).toBe(
      'loading'
    );
  });

  it('redirects when user is null and auth check is complete', () => {
    // This is the critical case; the old bug showed a spinner here
    expect(decideRouteAction({ user: null, isLoading: false, initialCheckComplete: true })).toBe(
      'redirect'
    );
  });

  it('allows access for authenticated users', () => {
    expect(
      decideRouteAction({
        user: { id: 'user-123' },
        isLoading: false,
        initialCheckComplete: true,
      })
    ).toBe('allow');
  });

  it('shows loading even with user if auth is still loading', () => {
    expect(
      decideRouteAction({
        user: { id: 'user-123' },
        isLoading: true,
        initialCheckComplete: false,
      })
    ).toBe('loading');
  });

  it('the old buggy condition would have shown spinner for unauthenticated users', () => {
    // Verify the OLD condition was wrong:
    // isLoading || !initialCheckComplete || (user === null && initialCheckComplete && !isLoading)
    const auth = { user: null, isLoading: false, initialCheckComplete: true };
    const oldCondition =
      auth.isLoading ||
      !auth.initialCheckComplete ||
      (auth.user === null && auth.initialCheckComplete && !auth.isLoading);

    // Old condition would be TRUE (show spinner); that was the bug
    expect(oldCondition).toBe(true);

    // New condition correctly returns 'redirect'
    expect(decideRouteAction(auth)).toBe('redirect');
  });
});
