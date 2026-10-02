import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  peekSessionDraft,
  registerSessionDraft,
  takeSessionDraft,
} from '@/services/auth/sessionRecovery';

export function useSessionDraft<T>(
  key: string | null | undefined,
  accountId: string | undefined,
  capture: () => T | undefined,
  onRestore?: (draft: T) => void
): T | undefined {
  const snapshot = useRef(capture);
  const restore = useRef(onRestore);
  const mounted = useRef(false);
  const restored = key && accountId ? peekSessionDraft<T>(key, accountId) : undefined;

  useLayoutEffect(() => {
    snapshot.current = capture;
    restore.current = onRestore;
  }, [capture, onRestore]);

  useEffect(() => {
    const wasMounted = mounted.current;
    mounted.current = true;
    if (!key || !accountId) return;
    const draft = peekSessionDraft<T>(key, accountId);
    const unregister = registerSessionDraft(key, () => snapshot.current());
    if (wasMounted && draft !== undefined) restore.current?.(draft);
    takeSessionDraft(key, accountId);
    return unregister;
  }, [key, accountId]);

  return restored;
}
