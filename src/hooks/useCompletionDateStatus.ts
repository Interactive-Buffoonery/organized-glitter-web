import { useEffect, useRef } from 'react';
import { getDateFieldSelectedDate } from '@/components/ui/date-field-utils';

export function useCompletionDateStatus<TStatus extends string>(
  completedStatus: TStatus,
  statusBeforeDateChange?: TStatus | null,
  onStatusBeforeDateChange?: (status: TStatus | null) => void
) {
  const statusBeforeDateChangeRef = useRef<TStatus | null>(statusBeforeDateChange ?? null);

  useEffect(() => {
    statusBeforeDateChangeRef.current = statusBeforeDateChange ?? null;
  }, [statusBeforeDateChange]);

  const setStatusBeforeDateChange = (status: TStatus | null) => {
    statusBeforeDateChangeRef.current = status;
    onStatusBeforeDateChange?.(status);
  };

  const statusForStatusChange = (
    nextStatus: TStatus,
    currentDate: string | null | undefined,
    savedDate: string | null | undefined
  ): TStatus => {
    const selectedDate = getDateFieldSelectedDate(currentDate ?? '');
    const originalDate = getDateFieldSelectedDate(savedDate ?? '');
    if (
      selectedDate &&
      selectedDate.toString() !== originalDate?.toString() &&
      nextStatus !== completedStatus &&
      nextStatus !== 'archived' &&
      nextStatus !== 'destashed'
    ) {
      setStatusBeforeDateChange(nextStatus);
      return completedStatus;
    }
    setStatusBeforeDateChange(null);
    return nextStatus;
  };

  const statusForDateChange = (
    nextDate: string,
    currentDate: string | null | undefined,
    currentStatus: TStatus,
    savedDate: string | null | undefined
  ): TStatus => {
    const selectedDate = getDateFieldSelectedDate(nextDate);
    const originalDate = getDateFieldSelectedDate(savedDate ?? '');
    if (
      ((selectedDate && selectedDate.toString() === originalDate?.toString()) ||
        (nextDate === '' && Boolean(currentDate))) &&
      statusBeforeDateChangeRef.current &&
      currentStatus === completedStatus
    ) {
      const previousStatus = statusBeforeDateChangeRef.current;
      setStatusBeforeDateChange(null);
      return previousStatus;
    }
    if (
      selectedDate &&
      selectedDate.toString() !== originalDate?.toString() &&
      currentStatus !== 'archived' &&
      currentStatus !== 'destashed'
    ) {
      if (currentStatus !== completedStatus && !statusBeforeDateChangeRef.current) {
        setStatusBeforeDateChange(currentStatus);
      }
      return completedStatus;
    }
    return currentStatus;
  };

  return {
    statusBeforeDateChange: statusBeforeDateChangeRef.current,
    setStatusBeforeDateChange,
    statusForStatusChange,
    statusForDateChange,
  };
}
