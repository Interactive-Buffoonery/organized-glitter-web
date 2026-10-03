import { useCallback, useEffect, useRef, useState } from 'react';
import { requestPocketBaseHealth } from '@/services/pocketbase/connection.service';

const CONNECTION_CHECK_TIMEOUT_MS = 5_000;

const CONNECTION_CHECK_ERROR = 'Still unable to connect. Please try again.';

type ConnectionRecoveryState =
  | { status: 'online' }
  | { status: 'offline' }
  | { status: 'checking' }
  | { status: 'failed'; message: typeof CONNECTION_CHECK_ERROR };

interface ActiveCheck {
  id: number;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
}

interface ConnectionRecovery {
  state: ConnectionRecoveryState;
  checkConnection: () => void;
}

export const useConnectionRecovery = (): ConnectionRecovery => {
  const [state, setState] = useState<ConnectionRecoveryState>(() =>
    navigator.onLine ? { status: 'online' } : { status: 'offline' }
  );
  const stateRef = useRef(state);
  const activeCheckRef = useRef<ActiveCheck | null>(null);
  const nextCheckIdRef = useRef(0);
  const mountedRef = useRef(true);

  const transition = useCallback((nextState: ConnectionRecoveryState) => {
    stateRef.current = nextState;
    if (mountedRef.current) {
      setState(nextState);
    }
  }, []);

  const cancelActiveCheck = useCallback(() => {
    nextCheckIdRef.current += 1;

    const activeCheck = activeCheckRef.current;
    if (!activeCheck) {
      return;
    }

    activeCheckRef.current = null;
    clearTimeout(activeCheck.timeout);
    activeCheck.controller.abort();
  }, []);

  const checkConnection = useCallback(() => {
    if (activeCheckRef.current) {
      return;
    }

    // navigator.onLine is only a hint; an explicit Check connection should
    // still make the bounded request so a stale flag cannot wedge recovery.
    const id = ++nextCheckIdRef.current;
    const controller = new AbortController();
    let rejectTimeout: (reason: DOMException) => void = () => undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      controller.abort();
      rejectTimeout(new DOMException('Connection check timed out', 'AbortError'));
    }, CONNECTION_CHECK_TIMEOUT_MS);

    activeCheckRef.current = { id, controller, timeout };
    transition({ status: 'checking' });

    void Promise.race([requestPocketBaseHealth(controller.signal), timeoutPromise])
      .then(response => {
        if (activeCheckRef.current?.id !== id || !mountedRef.current) {
          return;
        }

        transition(
          response.ok ? { status: 'online' } : { status: 'failed', message: CONNECTION_CHECK_ERROR }
        );
      })
      .catch(() => {
        if (activeCheckRef.current?.id === id && mountedRef.current) {
          transition({ status: 'failed', message: CONNECTION_CHECK_ERROR });
        }
      })
      .finally(() => {
        if (activeCheckRef.current?.id !== id) {
          return;
        }

        clearTimeout(activeCheckRef.current.timeout);
        activeCheckRef.current = null;
      });
  }, [transition]);

  useEffect(() => {
    mountedRef.current = true;

    const handleOffline = () => {
      cancelActiveCheck();
      transition({ status: 'offline' });
    };
    const handleOnline = () => {
      if (stateRef.current.status !== 'online') {
        checkConnection();
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    if (navigator.onLine) {
      handleOnline();
    } else {
      handleOffline();
    }

    return () => {
      mountedRef.current = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      cancelActiveCheck();
    };
  }, [cancelActiveCheck, checkConnection, transition]);

  return { state, checkConnection };
};
