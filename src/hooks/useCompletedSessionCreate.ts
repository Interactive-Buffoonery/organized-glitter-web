import { useEffect, useState } from 'react';
import {
  subscribeToCompletedSessionCreate,
  peekCompletedSessionDestinations,
} from '@/services/auth/sessionRecovery';

export function useCompletedSessionCreate(accountId: string | undefined, prefix: string): string[] {
  const [completed, setCompleted] = useState<{ accountId: string; destinations: string[] }>();

  useEffect(() => {
    if (!accountId) {
      setCompleted(undefined);
      return;
    }
    const destinations = peekCompletedSessionDestinations(accountId, prefix);
    setCompleted({ accountId, destinations });

    return subscribeToCompletedSessionCreate((createdForAccount, destination) => {
      if (createdForAccount !== accountId || !destination.startsWith(prefix)) return;
      setCompleted({
        accountId,
        destinations: peekCompletedSessionDestinations(accountId, prefix),
      });
    });
  }, [accountId, prefix]);

  return completed && completed.accountId === accountId ? completed.destinations : [];
}
