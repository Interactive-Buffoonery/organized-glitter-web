/**
 * Render guards utility to prevent excessive re-renders
 * @author @serabi
 * @created 2025-07-09
 */

import { useLayoutEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';

const logger = createLogger('RenderGuards');

/**
 * Hook to track and warn about excessive re-renders
 */
export const useRenderGuard = (componentName: string, threshold: number = 10) => {
  const renderCountRef = useRef(0);
  const lastWarningTimeRef = useRef(0);
  const resetTimeRef = useRef(0);

  // This flag belongs to this render's effect closure, so StrictMode replay
  // does not count a second commit. An abandoned render never runs the effect.
  const commit = { counted: false };
  useLayoutEffect(() => {
    if (commit.counted) return;
    commit.counted = true;
    const now = Date.now();
    if (renderCountRef.current === 0 || now - resetTimeRef.current > 3000) {
      renderCountRef.current = 1;
      resetTimeRef.current = now;
    } else {
      renderCountRef.current += 1;
    }

    if (renderCountRef.current > threshold && now - lastWarningTimeRef.current > 5000) {
      logger.warn(`${componentName} excessive re-renders detected:`, {
        renderCount: renderCountRef.current,
        threshold,
        timeSinceReset: now - resetTimeRef.current,
      });
      lastWarningTimeRef.current = now;
    }
  });

  // A new getter each render makes dependent effects read every counted commit.
  // Keep it unstable: ref changes alone cannot trigger those effects.
  // No state update is needed, which would itself inflate render telemetry.
  return {
    getRenderStats: () => ({
      renderCount: renderCountRef.current,
      isExcessive: renderCountRef.current > threshold,
    }),
  };
};

/**
 * Throttle logging to prevent log spam
 */
export const useThrottledLogger = (_componentName: string, intervalMs: number = 1000) => {
  const lastLogTimeRef = useRef(0);
  const logCountRef = useRef(0);

  const shouldLog = (force: boolean = false) => {
    const now = Date.now();
    const timeSinceLastLog = now - lastLogTimeRef.current;
    logCountRef.current += 1;

    // Log first 3 calls or after interval
    if (force || logCountRef.current <= 3 || timeSinceLastLog > intervalMs) {
      lastLogTimeRef.current = now;
      return true;
    }

    return false;
  };

  return { shouldLog };
};
