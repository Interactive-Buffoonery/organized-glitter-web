import { useEffect } from 'react';
import { createLogger } from '@/utils/logger';

const logger = createLogger('ProtectedRoute');

// Only warn if the router/browser pathname mismatch persists past this window.
// Transient mismatches during normal navigation (useLocation catches up a tick
// later than window.location) should not log.
export const LOCATION_MISMATCH_SETTLE_MS = 250;

/**
 * Warns when React Router's pathname and the browser's pathname stay out of
 * sync for longer than LOCATION_MISMATCH_SETTLE_MS. Short, in-flight mismatches
 * during normal navigation are ignored.
 *
 * Split out of ProtectedRoute so the debounce behavior is testable in isolation
 * (ProtectedRoute itself has a heavy import chain that OOMs the test collector).
 */
export function useLocationMismatchWarning(routerPathname: string): void {
  useEffect(() => {
    if (routerPathname === window.location.pathname) return;
    const timerId = window.setTimeout(() => {
      if (routerPathname !== window.location.pathname) {
        logger.warn('LOCATION MISMATCH DETECTED (persistent)!', {
          routerPath: routerPathname,
          browserPath: window.location.pathname,
          settleMs: LOCATION_MISMATCH_SETTLE_MS,
          timestamp: new Date().toISOString(),
        });
      }
    }, LOCATION_MISMATCH_SETTLE_MS);
    return () => window.clearTimeout(timerId);
  }, [routerPathname]);
}
