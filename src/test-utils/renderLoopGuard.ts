/**
 * Shared harness for route-mount smoke tests.
 *
 * Catches the class of bug where a child useEffect bubbles state to a parent
 * callback prop whose identity changes every render, which React 19 surfaces
 * as "Maximum update depth exceeded" via console.error (see commit a6c7ccd).
 *
 * Usage in a test file:
 *
 *   import { beforeEach, afterEach } from 'vitest';
 *   import {
 *     installRenderLoopGuard,
 *     assertNoRenderLoop,
 *   } from '@/test-utils/renderLoopGuard';
 *
 *   const guard = installRenderLoopGuard();
 *
 *   beforeEach(() => guard.reset());
 *   afterEach(() => guard.restore());
 *
 *   it('mounts without looping', () => {
 *     render(<Page />);
 *     assertNoRenderLoop(guard);
 *   });
 */

import { vi } from 'vitest';

export interface RenderLoopGuard {
  capturedErrors: string[];
  reset: () => void;
  restore: () => void;
}

const RENDER_LOOP_SIGNATURES = ['Maximum update depth exceeded', 'Too many re-renders'];

const formatConsoleCall = (args: unknown[]): string =>
  args
    .map(arg => {
      if (arg instanceof Error) return `${arg.message}\n${arg.stack ?? ''}`;
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');

/**
 * Install a console.error spy that captures every call for later inspection.
 * Returns a guard object with reset() and restore() lifecycle hooks and a
 * shared capturedErrors array that assertions read from.
 */
export const installRenderLoopGuard = (): RenderLoopGuard => {
  const capturedErrors: string[] = [];
  let spy: ReturnType<typeof vi.spyOn> | null = null;

  return {
    capturedErrors,
    reset: () => {
      capturedErrors.length = 0;
      spy?.mockRestore();
      spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        capturedErrors.push(formatConsoleCall(args));
      });
    },
    restore: () => {
      spy?.mockRestore();
      spy = null;
    },
  };
};

/**
 * Fail the test if any captured console.error call matches a known render-loop
 * signature. Includes the offending messages in the failure text so the stack
 * trace points at the real Radix/React frames.
 */
export const assertNoRenderLoop = (guard: RenderLoopGuard): void => {
  const loopErrors = guard.capturedErrors.filter(text =>
    RENDER_LOOP_SIGNATURES.some(sig => text.includes(sig))
  );
  if (loopErrors.length > 0) {
    throw new Error(
      'Detected React render-loop error on mount. This usually means a ' +
        'useEffect is calling a prop callback whose identity changes every ' +
        'render. Offending messages:\n\n' +
        loopErrors.join('\n---\n')
    );
  }
};

/**
 * Common fallback strings this repo's error boundaries render when a component
 * throws. Use with `expect(screen.queryByText(...)).not.toBeInTheDocument()`
 * to assert no error-boundary UI is on screen after mount.
 */
export const ERROR_BOUNDARY_FALLBACK_PATTERNS = {
  headline: /something went wrong/i,
  bodyText: /there was an error loading/i,
  retryButton: /try again/i,
} as const;
