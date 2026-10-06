import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { useAnalyticsPreference } from '@/hooks/useAnalyticsPreference';
import { syncAnalyticsConsent } from '@/services/analytics-preference';
import { useAuth } from '@/hooks/useAuth';
import { AnalyticsEvent } from '@/services/analytics-events';
import { isStandalone, isIOS, isSafari } from '@/utils/ui/deviceDetection';
import { sanitizeAnalyticsPath } from '@/utils/analytics/sanitizePath';

export { sanitizeAnalyticsPath } from '@/utils/analytics/sanitizePath';

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
  const analyticsEnabled = useAnalyticsPreference();
  const { user, isAuthenticated, initialCheckComplete } = useAuth();
  const accountId = isAuthenticated ? user?.id : undefined;
  const accountCreated = user?.created;
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);
  const sessionContextFired = useRef(false);
  const previousAccount = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!analyticsEnabled || !initialCheckComplete) return;
    const nextAccount = accountId ?? null;
    if (previousAccount.current === nextAccount) return;

    const existingAccount =
      previousAccount.current === undefined
        ? posthog.get_property('$user_id')
        : previousAccount.current;
    if (existingAccount && existingAccount !== nextAccount) {
      posthog.reset();
      syncAnalyticsConsent();
    }
    if (nextAccount) posthog.identify(nextAccount, { created: accountCreated });
    previousAccount.current = nextAccount;
  }, [posthog, analyticsEnabled, initialCheckComplete, accountId, accountCreated]);

  useEffect(() => {
    if (!analyticsEnabled || !initialCheckComplete || sessionContextFired.current) return;
    sessionContextFired.current = true;

    posthog.capture(AnalyticsEvent.SESSION_CONTEXT, {
      standalone: isStandalone(),
      is_ios: isIOS(),
      is_safari: isSafari(),
      screen_width: window.screen.width,
      screen_height: window.screen.height,
    });
  }, [posthog, analyticsEnabled, initialCheckComplete]);

  useEffect(() => {
    if (!analyticsEnabled || !initialCheckComplete || prevPathRef.current === location.pathname)
      return;
    const path = sanitizeAnalyticsPath(location.pathname);
    prevPathRef.current = location.pathname;

    posthog.capture(AnalyticsEvent.PAGE_VIEW, {
      $current_url: `${window.location.origin}${path}`,
      path,
    });
  }, [posthog, analyticsEnabled, initialCheckComplete, location.pathname]);
}
