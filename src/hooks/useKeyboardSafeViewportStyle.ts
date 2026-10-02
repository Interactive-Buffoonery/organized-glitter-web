import { useCallback, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react';

type KeyboardSafeViewportGeometry = {
  layoutHeight: number;
  visualHeight: number;
  offsetTop: number;
};

const fallbackKeyboardSafeViewportStyle: CSSProperties = {
  bottom: '0px',
  height: '100dvh',
  maxHeight: '100dvh',
};

const toPixels = (value: number) => `${Math.max(0, value)}px`;

export const getKeyboardSafeViewportStyle = (
  geometry: KeyboardSafeViewportGeometry | null
): CSSProperties => {
  if (!geometry) {
    return fallbackKeyboardSafeViewportStyle;
  }

  const bottomInset = geometry.layoutHeight - geometry.visualHeight - geometry.offsetTop;

  return {
    bottom: toPixels(bottomInset),
    height: toPixels(geometry.visualHeight),
    maxHeight: toPixels(geometry.visualHeight),
  };
};

const subscribeToViewport = (onChange: () => void) => {
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return () => {};
  }

  visualViewport.addEventListener('resize', onChange);
  visualViewport.addEventListener('scroll', onChange);
  window.addEventListener('resize', onChange);

  return () => {
    visualViewport.removeEventListener('resize', onChange);
    visualViewport.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
  };
};

const noopSubscribe = () => () => {};

const getViewportSnapshot = (): string => {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return '';
  }

  return `${window.innerHeight}|${window.visualViewport.height}|${window.visualViewport.offsetTop}`;
};

// The empty snapshot maps to the fallback style, matching the client's
// no-visualViewport branch. This app is a client-only Vite SPA (no SSR),
// so the server snapshot only exists to satisfy useSyncExternalStore.
const getServerSnapshot = () => '';

export function useKeyboardSafeViewportStyle(enabled: boolean): CSSProperties {
  const hasPublishedClientSnapshotRef = useRef(false);
  const getClientSnapshot = useCallback(() => {
    if (!hasPublishedClientSnapshotRef.current) {
      return '';
    }

    return getViewportSnapshot();
  }, []);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!enabled) {
        return noopSubscribe();
      }

      const unsubscribe = subscribeToViewport(onChange);
      let active = true;
      hasPublishedClientSnapshotRef.current = true;
      // Keep the initial snapshot stable until React subscribes, then publish viewport metrics.
      queueMicrotask(() => {
        if (active) {
          onChange();
        }
      });

      return () => {
        active = false;
        hasPublishedClientSnapshotRef.current = false;
        unsubscribe();
      };
    },
    [enabled]
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    enabled ? getClientSnapshot : getServerSnapshot,
    getServerSnapshot
  );

  return useMemo(() => {
    if (!snapshot) {
      return fallbackKeyboardSafeViewportStyle;
    }

    const [layoutHeight, visualHeight, offsetTop] = snapshot.split('|').map(Number);
    return getKeyboardSafeViewportStyle({ layoutHeight, visualHeight, offsetTop });
  }, [snapshot]);
}
