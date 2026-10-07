import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppInitialization } from '@/hooks/useAppInitialization';
import { hideSplash, markAppReady, useAppReady, useHideSplash } from '@/hooks/useAppReady';

vi.mock('@/services/auth', () => ({ setupGlobalAuthClear: vi.fn(() => vi.fn()) }));
vi.mock('@/utils/error/rateLimitNotifier', () => ({
  setupErrorHandler: vi.fn(() => vi.fn()),
}));
vi.mock('@/lib/notifications', () => ({
  notifyError: vi.fn(),
  notifyInfo: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

const analyticsScript = readFileSync(
  resolve(process.cwd(), 'public/js/bootstrap-analytics.js'),
  'utf8'
);
const loadingScript = readFileSync(resolve(process.cwd(), 'public/js/loading.js'), 'utf8');
let bootstrapRunId = 0;
const listeners: Array<Parameters<typeof window.addEventListener>> = [];

const bootstrapLoadingScript = () => {
  new Script(`{${analyticsScript}\n${loadingScript}\n}`, {
    filename: `loading-script-${bootstrapRunId++}.js`,
  }).runInThisContext();
};

const createTransitionEndEvent = () => {
  const event = new Event('transitionend');
  Object.defineProperty(event, 'propertyName', { value: 'opacity' });
  return event;
};

const markRootReady = () => {
  document.getElementById('root')?.setAttribute('data-app-ready', 'true');
};

const dispatchAppReady = () => {
  markRootReady();
  window.dispatchEvent(new CustomEvent('app-loaded'));
};

const createShellDom = () => {
  document.body.innerHTML = `
    <div id="root" style="opacity: 0;"></div>
    <div id="app-loading" style="opacity: 1;">
      <div></div>
    </div>
    <div id="app-error" role="alert" aria-hidden="true">
      <div class="error-card">
        <h2 tabindex="-1">Something went wrong</h2>
        <p class="error-body">
          Organized Glitter couldn’t finish loading. This usually clears with a refresh. Don’t
          worry! Your projects and coloring books are safe.
        </p>
        <button type="button" id="retry-button">Try again</button>
        <p class="contact-support-text">
          Still stuck?
          <a href="mailto:contact@organizedglitter.app?subject=App%20won%27t%20load">Email support</a>
        </p>
      </div>
    </div>
    <div id="slow-load-warning" style="display: none;"></div>
  `;
};

describe('loading bootstrap script', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createShellDom();
    window.__OG_PUBLIC_ANALYTICS__ = {
      key: 'phc_test_key',
      host: '/glimmer',
    };
    const addEventListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
      listeners.push(args);
      addEventListener.apply(window, args);
    });
  });

  afterEach(() => {
    for (const args of listeners.splice(0)) window.removeEventListener(...args);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete window.__OG_PUBLIC_ANALYTICS__;
    delete window.__OG_BOOTSTRAP_ANALYTICS__;
    vi.unstubAllGlobals();
  });

  it.each(['runtime.sendMessage(). Tab not found', 'Script error. at :0:0'])(
    'does not block startup for external noise: %s',
    message => {
      bootstrapLoadingScript();
      window.dispatchEvent(new ErrorEvent('error', { message, error: new Error(message) }));
      vi.advanceTimersByTime(300);
      expect(document.getElementById('app-error')?.style.display).not.toBe('flex');
      dispatchAppReady();
      vi.advanceTimersByTime(300);
      expect(document.getElementById('root')?.hasAttribute('inert')).toBe(false);
    }
  );

  it('ignores extension rejection objects but keeps the startup deadline armed', () => {
    bootstrapLoadingScript();
    const event = new Event('unhandledrejection');
    Object.defineProperty(event, 'reason', {
      value: { message: 'Error: Invalid call to runtime.sendMessage(). Tab not found.' },
    });
    window.dispatchEvent(event);
    vi.advanceTimersByTime(300);
    expect(document.getElementById('app-error')?.style.display).not.toBe('flex');
    vi.advanceTimersByTime(30000);
    expect(document.getElementById('app-error')?.style.display).toBe('flex');
  });

  it('captures recovery once only after a displayed failure becomes ready', () => {
    bootstrapLoadingScript();
    const recovered = vi.fn();
    Object.assign(window.__OG_BOOTSTRAP_ANALYTICS__!, {
      captureBootstrapRecovery: recovered,
    });
    vi.advanceTimersByTime(30300);
    dispatchAppReady();
    dispatchAppReady();
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(recovered).toHaveBeenCalledWith('startup_timeout');
  });

  it('offers slow-start guidance at five seconds without marking private content ready', () => {
    bootstrapLoadingScript();
    vi.advanceTimersByTime(4999);
    expect(document.getElementById('slow-load-warning')?.style.display).toBe('none');
    vi.advanceTimersByTime(1);
    expect(document.getElementById('slow-load-warning')?.style.display).toBe('block');
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(true);
    expect(document.getElementById('root')?.getAttribute('data-app-ready')).not.toBe('true');
    vi.advanceTimersByTime(25300);
    expect(document.getElementById('app-error')?.style.display).toBe('flex');
  });

  it('does not add slow-start guidance after a completed startup', () => {
    bootstrapLoadingScript();
    dispatchAppReady();
    vi.advanceTimersByTime(5500);
    expect(document.getElementById('slow-load-warning')?.style.display).toBe('none');
  });

  it('makes the splash non-interactive immediately and removes it after fade completes', () => {
    bootstrapLoadingScript();

    const loadingEl = document.getElementById('app-loading');
    expect(loadingEl).not.toBeNull();

    dispatchAppReady();

    expect(loadingEl?.style.pointerEvents).toBe('none');
    expect(loadingEl?.style.opacity).toBe('0');
    expect(loadingEl?.getAttribute('aria-hidden')).toBe('true');
    expect(document.getElementById('app-loading')).not.toBeNull();

    loadingEl?.dispatchEvent(createTransitionEndEvent());

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).toBeNull();
    expect(document.getElementById('root')?.style.opacity).toBe('1');
    expect(document.getElementById('root')?.getAttribute('data-app-ready')).toBe('true');
  });

  it('removes the splash on the timeout fallback when transitionend never fires', () => {
    bootstrapLoadingScript();

    dispatchAppReady();
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).toBeNull();
  });

  it('shows recovery UI instead of declaring an empty app ready after the deadline', () => {
    const ready = vi.fn();
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon,
      doNotTrack: '0',
    });
    window.addEventListener('app-loaded', ready);
    bootstrapLoadingScript();

    vi.advanceTimersByTime(30300);

    expect(ready).not.toHaveBeenCalled();
    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(document.getElementById('retry-button')).not.toBeNull();
    expect(document.getElementById('root')?.children).toHaveLength(0);
    expect(document.getElementById('error-details')).toBeNull();
    expect(document.body.textContent).toContain('Try again');
    expect(document.body.textContent).not.toMatch(/at .+\.(tsx|js):\d+/);
    expect(sendBeacon).toHaveBeenCalled();
    expect(String(sendBeacon.mock.calls[0]?.[0])).toBe('/glimmer/e/');
  });

  it('does not render raw runtime error details in the recovery UI', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon,
      doNotTrack: '0',
    });
    bootstrapLoadingScript();

    const boom = new Error('secret stack path /src/main.tsx:12');
    boom.stack = 'Error: secret stack path /src/main.tsx:12\n    at boot (main.tsx:12:3)';
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: boom,
        message: boom.message,
        filename: '/src/main.tsx',
        lineno: 12,
        colno: 3,
      })
    );
    vi.advanceTimersByTime(300);

    const errorEl = document.getElementById('app-error');
    expect(errorEl?.style.display).toBe('flex');
    expect(errorEl?.textContent).not.toContain('secret stack path');
    expect(errorEl?.textContent).not.toContain('main.tsx');
    expect(errorEl?.textContent).toContain('Something went wrong');
    expect(document.getElementById('error-details')).toBeNull();
    expect(sendBeacon).toHaveBeenCalled();
    const beaconBody = sendBeacon.mock.calls[0]?.[1];
    expect(beaconBody).toBeInstanceOf(Blob);
  });

  it('keeps a mounted app without readiness recoverable past the 20-second mark', () => {
    bootstrapLoadingScript();
    const ready = vi.fn();
    window.addEventListener('app-loaded', ready);
    const { unmount } = renderHook(() => useAppInitialization());

    try {
      act(() => vi.advanceTimersByTime(20300));
      expect(ready).not.toHaveBeenCalled();
      expect(document.getElementById('app-loading')).not.toBeNull();

      act(() => vi.advanceTimersByTime(10000));
      expect(ready).not.toHaveBeenCalled();
      expect(document.getElementById('app-error')?.style.display).toBe('flex');
      expect(document.getElementById('retry-button')).not.toBeNull();
    } finally {
      unmount();
    }
  });

  it('handles a failed app module resource without waiting for the deadline', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', {
      ...navigator,
      sendBeacon,
      doNotTrack: '0',
    });
    bootstrapLoadingScript();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/main-test.js';
    document.head.append(script);

    script.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(sendBeacon).toHaveBeenCalled();
    script.remove();
  });

  it('allows startup to finish when an optional classic script fails', () => {
    bootstrapLoadingScript();
    const script = document.createElement('script');
    script.src = '/__spacefast/sdk.js';
    document.head.append(script);
    script.dispatchEvent(new Event('error'));
    dispatchAppReady();
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-error')).toBeNull();
    script.remove();
  });

  it('does not replace a ready app when a same-origin module fails during the splash fade', () => {
    bootstrapLoadingScript();
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/main-test.js';
    document.head.append(script);

    dispatchAppReady();
    script.dispatchEvent(new Event('error'));
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-error')).toBeNull();
    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('root')?.style.opacity).toBe('1');
    script.remove();
  });

  it('does not resurrect #app-error if the app becomes ready during the splash fade', () => {
    bootstrapLoadingScript();
    vi.advanceTimersByTime(30000);

    const loadingEl = document.getElementById('app-loading');
    const errorEl = document.getElementById('app-error');
    const root = document.getElementById('root');
    expect(loadingEl?.classList.contains('is-fading')).toBe(true);
    expect(errorEl?.style.display).not.toBe('flex');

    markRootReady();
    window.dispatchEvent(new CustomEvent('app-loaded'));

    loadingEl?.dispatchEvent(createTransitionEndEvent());
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-error')).toBeNull();
    expect(root?.hasAttribute('inert')).toBe(false);
    expect(root?.style.opacity).toBe('1');
  });

  it('dismisses a startup error when a late ready signal marks the app ready', () => {
    bootstrapLoadingScript();
    vi.advanceTimersByTime(30300);

    const errorEl = document.getElementById('app-error');
    const root = document.getElementById('root');
    expect(errorEl?.style.display).toBe('flex');
    expect(root?.hasAttribute('inert')).toBe(true);

    markRootReady();
    window.dispatchEvent(new CustomEvent('app-loaded'));

    expect(document.getElementById('app-error')).toBeNull();
    expect(document.body.textContent).not.toContain('Try again');
    expect(document.body.textContent).not.toContain('Something went wrong');
    expect(root?.style.opacity).toBe('1');
    expect(root?.hasAttribute('inert')).toBe(false);
  });

  it('keeps a startup error when app-loaded fires without a ready marker', () => {
    bootstrapLoadingScript();
    vi.advanceTimersByTime(30300);
    window.dispatchEvent(new CustomEvent('app-loaded'));
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(true);
  });

  it('sets #root inert while the splash is showing and clears it when the app is revealed', () => {
    bootstrapLoadingScript();

    const root = document.getElementById('root');
    expect(root?.hasAttribute('inert')).toBe(true);

    dispatchAppReady();
    document.getElementById('app-loading')?.dispatchEvent(createTransitionEndEvent());

    expect(root?.hasAttribute('inert')).toBe(false);
    expect(root?.style.opacity).toBe('1');
  });

  it('sets #root inert in showError before focusing Try again', () => {
    bootstrapLoadingScript();
    const root = document.getElementById('root');
    const retry = document.getElementById('retry-button');
    expect(root).not.toBeNull();
    expect(retry).not.toBeNull();

    const setAttrSpy = vi.spyOn(root as HTMLElement, 'setAttribute');
    const focusSpy = vi.spyOn(retry as HTMLElement, 'focus');

    vi.advanceTimersByTime(30300);

    const inertOrder = setAttrSpy.mock.calls
      .map((call, index) =>
        call[0] === 'inert' ? setAttrSpy.mock.invocationCallOrder[index] : undefined
      )
      .filter((order): order is number => typeof order === 'number')
      .at(-1);
    const focusOrder = focusSpy.mock.invocationCallOrder[0];

    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(root?.hasAttribute('inert')).toBe(true);
    expect(inertOrder).toBeDefined();
    expect(focusOrder).toBeDefined();
    expect(inertOrder as number).toBeLessThan(focusOrder);
  });

  it('hides the splash immediately when prefers-reduced-motion is set', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }));

    bootstrapLoadingScript();
    dispatchAppReady();

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).toBeNull();
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(false);
  });

  it('stops splash spinner animation under prefers-reduced-motion in CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'public/css/loading.css'), 'utf8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/#app-loading \.spinner\s*\{\s*animation:\s*none;/);
  });

  it('shows recovery UI after 30s when #root only has a Suspense fallback', () => {
    const root = document.getElementById('root');
    const fallback = document.createElement('div');
    fallback.setAttribute('role', 'status');
    fallback.textContent = 'Loading page';
    root?.append(fallback);

    const ready = vi.fn();
    window.addEventListener('app-loaded', ready);
    bootstrapLoadingScript();

    vi.advanceTimersByTime(30300);

    expect(ready).not.toHaveBeenCalled();
    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(document.getElementById('retry-button')).not.toBeNull();
    expect(root?.getAttribute('data-app-ready')).not.toBe('true');
  });

  it('shows recovery UI at 30s after splash dismiss if #root was never marked ready', () => {
    const root = document.getElementById('root');
    const fallback = document.createElement('div');
    fallback.setAttribute('role', 'status');
    fallback.textContent = 'Loading page';
    root?.append(fallback);
    bootstrapLoadingScript();

    window.dispatchEvent(new CustomEvent('app-loaded'));
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).not.toBeNull();
    expect(document.getElementById('app-error')?.style.display).not.toBe('flex');
    expect(root?.getAttribute('data-app-ready')).not.toBe('true');

    vi.advanceTimersByTime(30000);

    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(document.getElementById('retry-button')).not.toBeNull();
  });

  it('removes leftover #app-error when markAppReady follows a splash-only dismiss', () => {
    bootstrapLoadingScript();

    hideSplash();
    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).not.toBeNull();
    expect(document.getElementById('root')?.getAttribute('data-app-ready')).not.toBe('true');

    markAppReady();

    expect(document.getElementById('app-error')).toBeNull();
    expect(document.getElementById('root')?.getAttribute('data-app-ready')).toBe('true');
    expect(document.getElementById('root')?.style.opacity).toBe('1');
  });

  it('Login-style hide-then-ready still retires leftover #app-error', () => {
    bootstrapLoadingScript();

    const { rerender, unmount } = renderHook(
      ({ hide, ready }: { hide: boolean; ready: boolean }) => {
        useHideSplash(hide);
        useAppReady(ready);
      },
      { initialProps: { hide: true, ready: false } }
    );

    try {
      act(() => vi.advanceTimersByTime(300));

      expect(document.getElementById('app-loading')).toBeNull();
      expect(document.getElementById('app-error')).not.toBeNull();
      expect(document.getElementById('root')?.getAttribute('data-app-ready')).not.toBe('true');

      rerender({ hide: false, ready: true });

      expect(document.getElementById('app-error')).toBeNull();
      expect(document.getElementById('root')?.getAttribute('data-app-ready')).toBe('true');
    } finally {
      unmount();
    }
  });

  it('hides splash immediately when React marked ready before loading.js booted', () => {
    markRootReady();
    bootstrapLoadingScript();

    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(false);

    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).toBeNull();
    expect(document.getElementById('root')?.style.opacity).toBe('1');
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(false);

    vi.advanceTimersByTime(30300);
    expect(document.getElementById('app-error')).toBeNull();
  });

  it('dismisses the splash after 30s when #root is marked ready without app-loaded', () => {
    const ready = vi.fn();
    window.addEventListener('app-loaded', ready);
    bootstrapLoadingScript();
    markRootReady();

    expect(ready).not.toHaveBeenCalled();
    expect(document.getElementById('app-loading')).not.toBeNull();

    vi.advanceTimersByTime(30300);

    expect(ready).toHaveBeenCalled();
    expect(document.getElementById('app-error')?.style.display).not.toBe('flex');

    vi.advanceTimersByTime(300);

    expect(document.getElementById('app-loading')).toBeNull();
    expect(document.getElementById('app-error')).toBeNull();
    expect(document.getElementById('root')?.style.opacity).toBe('1');
  });
});

declare global {
  interface Window {
    __OG_PUBLIC_ANALYTICS__?: { key: string; host: string };
    __OG_BOOTSTRAP_ANALYTICS__?: unknown;
  }
}
