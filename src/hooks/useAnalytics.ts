import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { useAuth } from '@/hooks/useAuth';
import { AnalyticsEvent } from '@/services/analytics-events';
import { isStandalone, isIOS, isSafari } from '@/utils/ui/deviceDetection';
import { sanitizeSensitivePath } from '@/utils/auth/sensitivePath';

export function sanitizeAnalyticsPath(pathname: string): string {
  return sanitizeSensitivePath(pathname);
}

/**
 * Hook that wires PostHog analytics into the React lifecycle:
 * - Fires a one-time session-context event on mount
 * - Identifies / resets the user when auth state changes
 * - Captures a `$pageview` on every route change
 *
 * Must be rendered inside PostHogProvider, BrowserRouter, and AuthProvider.
 */
export function useAnalytics(): void {
  const posthog = usePostHog();
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);
  const sessionContextFired = useRef(false);

  // 1. Fire session context once
  useEffect(() => {
    if (sessionContextFired.current) return;
    sessionContextFired.current = true;

    posthog.capture(AnalyticsEvent.SESSION_CONTEXT, {
      standalone: isStandalone(),
      is_ios: isIOS(),
      is_safari: isSafari(),
      screen_width: window.screen.width,
      screen_height: window.screen.height,
    });
  }, [posthog]);

  // 2. Identify or reset on auth changes
  useEffect(() => {
    if (isAuthenticated && user) {
      posthog.identify(user.id, {
        created: user.created,
      });
    } else {
      posthog.reset();
    }
  }, [posthog, isAuthenticated, user]);

  // 3. Track pageviews on route changes
  useEffect(() => {
    const path = sanitizeAnalyticsPath(location.pathname);
    if (prevPathRef.current === path) return;
    prevPathRef.current = path;

    posthog.capture(AnalyticsEvent.PAGE_VIEW, {
      $current_url: `${window.location.origin}${path}`,
      path,
    });
  }, [posthog, location.pathname]);
}
