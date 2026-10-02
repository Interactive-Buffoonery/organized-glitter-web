import { useRef, useState } from 'react';

type RetryPhase = 'idle' | 'pending' | 'failed' | 'succeeded';

export function useDetailRetryState(label: string, identity: string | undefined) {
  const [state, setState] = useState<{ identity: string | undefined; phase: RetryPhase }>({
    identity,
    phase: 'idle',
  });
  const inFlight = useRef<{ identity: string | undefined } | null>(null);
  const phase = state.identity === identity ? state.phase : 'idle';

  const retry = async (action: () => Promise<boolean>) => {
    if (inFlight.current && inFlight.current.identity === identity) return;
    const attempt = { identity };
    inFlight.current = attempt;
    setState({ identity, phase: 'pending' });
    try {
      const succeeded = await action();
      if (inFlight.current === attempt) {
        setState({ identity, phase: succeeded ? 'succeeded' : 'failed' });
      }
    } catch {
      if (inFlight.current === attempt) {
        setState({ identity, phase: 'failed' });
      }
    } finally {
      if (inFlight.current === attempt) inFlight.current = null;
    }
  };

  const announcement = {
    idle: '',
    pending: `Trying again to load ${label}.`,
    failed: `Still could not load ${label}. Try again.`,
    succeeded: `${label[0].toUpperCase()}${label.slice(1)} loaded.`,
  }[phase];

  return { isRetrying: phase === 'pending', announcement, retry };
}
