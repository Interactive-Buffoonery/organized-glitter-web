import { formatDateInUserTimezone, detectUserTimezone } from '@/utils/date/timezoneUtils';

export const formatProjectDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'Not specified';

  try {
    const userTimezone = detectUserTimezone();
    return formatDateInUserTimezone(dateString, userTimezone, 'M/d/yyyy');
  } catch {
    return 'Invalid date';
  }
};
