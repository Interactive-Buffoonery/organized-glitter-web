import { useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { POCKETBASE_URL } from '@/lib/pocketbaseConfig';
import { modeKey, readMode, writeMode, subscribeMode, type StreakMode } from './preference';

export function useStreakMode() {
  const { user } = useAuth();
  const key = user ? modeKey(POCKETBASE_URL, user.id) : null;
  const mode = useSyncExternalStore(
    subscribeMode,
    () => (key ? readMode(key) : 'off'),
    () => 'off'
  );
  return {
    mode,
    setMode: (value: StreakMode) => {
      if (key) writeMode(key, value);
    },
  };
}
