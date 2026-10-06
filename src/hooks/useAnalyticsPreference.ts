import { useSyncExternalStore } from 'react';
import { getAnalyticsEnabled, subscribeAnalyticsPreference } from '@/services/analytics-preference';

export function useAnalyticsPreference(): boolean {
  return useSyncExternalStore(subscribeAnalyticsPreference, getAnalyticsEnabled, () => true);
}
