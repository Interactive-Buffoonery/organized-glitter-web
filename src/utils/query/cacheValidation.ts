/**
 * Cache Validation Utilities
 *
 * Provides utilities to validate React Query cache entries and prevent
 * queries with stale or invalid record IDs that could cause 404 errors.
 */

import { QueryClient } from '@tanstack/react-query';
import { createLogger } from '@/utils/logger';

const logger = createLogger('CacheValidation');

/**
 * Removes invalid cache entries that could cause 404 errors
 */
function cleanInvalidCacheEntries(queryClient: QueryClient): number {
  let removedCount = 0;

  // Get all queries in cache
  const queryCache = queryClient.getQueryCache();
  const queries = queryCache.getAll();

  for (const query of queries) {
    const queryKey = query.queryKey;

    // Skip if query is currently fetching (don't interrupt in-progress requests)
    if (query.state.fetchStatus === 'fetching') continue;

    // Check if query has error state that indicates stale data
    if (query.state.error) {
      const error = query.state.error;

      // Remove queries with 404 errors - they indicate stale cache
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;

        if (status === 404) {
          logger.debug(`Removing query with 404 error: ${queryKey.join('.')}`);
          queryClient.removeQueries({ queryKey });
          removedCount++;
          continue;
        }
      }
    }
  }

  if (removedCount > 0) {
    logger.info(`Cleaned ${removedCount} invalid cache entries`);
  }

  return removedCount;
}

/**
 * Sets up automatic cache cleaning on navigation
 *
 * IMPORTANT: This function modifies global history methods as a fallback.
 * Prefer using useNavigationCacheCleaning() hook with Wouter instead.
 *
 * This implementation uses safeguards to preserve existing behavior:
 * - Stores original method references before modification
 * - Chains calls to preserve existing functionality
 * - Uses custom events to avoid direct coupling
 * - Includes detection to prevent double-wrapping
 * - Provides proper cleanup to restore original state
 */
export function setupAutomaticCacheCleaning(queryClient: QueryClient): () => void {
  // Clean cache every time the user navigates
  const handleNavigation = () => {
    // Use setTimeout to run after React Query has had time to invalidate queries
    setTimeout(() => {
      cleanInvalidCacheEntries(queryClient);
    }, 100);
  };

  // Listen for popstate events (back/forward navigation)
  window.addEventListener('popstate', handleNavigation);

  // Create a safer navigation monitoring system using custom events
  const navigationHandler = (event: Event) => {
    if (event.type === 'navigation') {
      handleNavigation();
    }
  };

  // Listen for custom navigation events
  window.addEventListener('navigation', navigationHandler);

  // Store references to original methods for safe chaining
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  // Create a wrapper that preserves existing behavior and adds our functionality
  const wrappedPushState = function (this: History, ...args: Parameters<History['pushState']>) {
    // Call the original method first to preserve existing behavior
    const result = originalPushState.apply(this, args);

    // Dispatch custom event instead of direct callback
    window.dispatchEvent(
      new CustomEvent('navigation', {
        detail: { type: 'pushState', args },
      })
    );

    return result;
  };

  const wrappedReplaceState = function (
    this: History,
    ...args: Parameters<History['replaceState']>
  ) {
    // Call the original method first to preserve existing behavior
    const result = originalReplaceState.apply(this, args);

    // Dispatch custom event instead of direct callback
    window.dispatchEvent(
      new CustomEvent('navigation', {
        detail: { type: 'replaceState', args },
      })
    );

    return result;
  };

  // Mark wrapper functions as wrapped for reliable detection
  (wrappedPushState as unknown as { __isWrapped: boolean }).__isWrapped = true;
  (wrappedReplaceState as unknown as { __isWrapped: boolean }).__isWrapped = true;

  // Only override if we haven't already wrapped these methods
  if (!(history.pushState as unknown as { __isWrapped: boolean }).__isWrapped) {
    history.pushState = wrappedPushState;
  }
  if (!(history.replaceState as unknown as { __isWrapped: boolean }).__isWrapped) {
    history.replaceState = wrappedReplaceState;
  }

  // Return cleanup function that safely restores original behavior
  return () => {
    window.removeEventListener('popstate', handleNavigation);
    window.removeEventListener('navigation', navigationHandler);

    // Only restore if we were the ones who wrapped it
    if (history.pushState === wrappedPushState) {
      history.pushState = originalPushState;
    }
    if (history.replaceState === wrappedReplaceState) {
      history.replaceState = originalReplaceState;
    }
  };
}
