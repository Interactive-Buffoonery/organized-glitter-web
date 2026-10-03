import { useEffect, useRef } from 'react';
import { capture } from '@/services/analytics-escape-hatch';
import { AnalyticsEvent } from '@/services/analytics-events';

/**
 * Measures the time from dashboard mount to data loaded.
 * Fires a single `dashboard_loaded` PostHog event with the duration.
 *
 * @param isLoading - true while the main project query is in flight
 */
export function useDashboardPerformance(isLoading: boolean): void {
  const mountTime = useRef(performance.now());
  const hasFired = useRef(false);

  useEffect(() => {
    if (isLoading || hasFired.current) return;
    hasFired.current = true;

    const durationMs = Math.round(performance.now() - mountTime.current);
    capture(AnalyticsEvent.DASHBOARD_LOADED, { duration_ms: durationMs });
  }, [isLoading]);
}
