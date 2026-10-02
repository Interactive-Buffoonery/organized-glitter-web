/**
 * Hook for accessing user timezone preference with fallbacks
 * @author @serabi
 * @created 2025-01-13
 */

import { useAuth } from '@/hooks/useAuth';
import { detectUserTimezone } from '@/utils/date/timezoneUtils';

/**
 * Hook to get the user's preferred timezone with intelligent fallbacks
 *
 * @returns User's timezone preference, browser-detected timezone, or UTC as final fallback
 */
export function useUserTimezone(): string {
  const { user } = useAuth();

  // Priority order: user preference > browser detection > UTC fallback
  return user?.timezone || detectUserTimezone();
}
