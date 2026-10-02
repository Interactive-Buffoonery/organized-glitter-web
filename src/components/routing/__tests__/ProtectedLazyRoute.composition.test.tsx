import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { lazy, type ComponentType } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: { id: 'user-123' } as { id: string } | null,
    isLoading: false,
    initialCheckComplete: true,
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/useLocationMismatchWarning', () => ({
  useLocationMismatchWarning: vi.fn(),
}));

vi.mock('@/services/analytics-escape-hatch', () => ({
  captureException: vi.fn(),
}));

import { ProtectedLazyRoute } from '../ProtectedLazyRoute';
import { hideSplash, markAppReady } from '@/hooks/useAppReady';

const appLoadedCalls = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.filter(([event]) => event instanceof CustomEvent && event.type === 'app-loaded');

const loadingScript = readFileSync(resolve(process.cwd(), 'public/js/loading.js'), 'utf8');
let loadingScriptRunId = 0;
const loadingScriptListeners: Array<Parameters<typeof window.addEventListener>> = [];

const bootstrapLoadingScript = () => {
  new Script(`{${loadingScript}\n}`, {
    filename: `protected-lazy-loading-${loadingScriptRunId++}.js`,
  }).runInThisContext();
};

const createStartupShell = () => {
  document.body.innerHTML = `
    <div id="root" style="opacity: 0;"></div>
    <div id="app-loading"></div>
    <div id="app-error" role="alert" aria-hidden="true">
      <h2 tabindex="-1">Something went wrong</h2>
      <button type="button" id="retry-button">Try again</button>
    </div>
  `;
};

describe('ProtectedLazyRoute composition', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    authState.user = { id: 'user-123' };
    authState.isLoading = false;
    authState.initialCheckComplete = true;
  });

  afterEach(() => {
    for (const args of loadingScriptListeners.splice(0)) window.removeEventListener(...args);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('does not mark the app ready while a lazy child is pending', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    const LazyPage = lazy(
      () =>
        new Promise<{ default: ComponentType }>(() => {
          // Hung chunk: never resolves and never rejects.
        })
    );

    render(
      <MemoryRouter>
        <ProtectedLazyRoute protected suspense="bare">
          <LazyPage />
        </ProtectedLazyRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(root.getAttribute('data-app-ready')).toBeNull();
    expect(appLoadedCalls(dispatchSpy)).toHaveLength(0);
    expect(screen.queryByText('Lazy page')).not.toBeInTheDocument();
  });

  it('marks the app ready and shows the route error UI when a lazy chunk rejects', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const LazyPage = lazy(() => Promise.reject(new Error('Loading chunk dashboard failed')));

    render(
      <MemoryRouter>
        <ProtectedLazyRoute protected suspense="bare" errorBoundary="Dashboard">
          <LazyPage />
        </ProtectedLazyRoute>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Loading Error' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
    await waitFor(() => {
      expect(root.getAttribute('data-app-ready')).toBe('true');
    });
    expect(appLoadedCalls(dispatchSpy).length).toBeGreaterThan(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('focuses Loading Error only after splash hide clears #root inert', async () => {
    createStartupShell();
    const addEventListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
      loadingScriptListeners.push(args);
      addEventListener.apply(window, args);
    });
    bootstrapLoadingScript();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const root = document.getElementById('root');
    expect(root?.hasAttribute('inert')).toBe(true);

    const headingFocusWhileInert: boolean[] = [];
    const originalFocus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement,
      ...args: Parameters<typeof HTMLElement.prototype.focus>
    ) {
      if (this.tagName === 'H1') {
        headingFocusWhileInert.push(
          Boolean(document.getElementById('root')?.hasAttribute('inert'))
        );
      }
      return originalFocus.apply(this, args);
    });

    const LazyPage = lazy(() => Promise.reject(new Error('Loading chunk dashboard failed')));

    render(
      <MemoryRouter>
        <ProtectedLazyRoute protected suspense="bare" errorBoundary="Dashboard">
          <LazyPage />
        </ProtectedLazyRoute>
      </MemoryRouter>,
      { container: root as HTMLElement }
    );

    const heading = await screen.findByRole('heading', { name: 'Loading Error' });
    expect(root?.hasAttribute('inert')).toBe(true);
    expect(headingFocusWhileInert).not.toContain(false);

    const loadingEl = document.getElementById('app-loading');
    const transitionEnd = new Event('transitionend');
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'opacity' });
    loadingEl?.dispatchEvent(transitionEnd);

    await waitFor(() => {
      expect(root?.hasAttribute('inert')).toBe(false);
    });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(headingFocusWhileInert).toContain(false);
  });

  it('does not mark ready while PageLoading is hung and still times out', () => {
    vi.useFakeTimers();
    createStartupShell();
    const addEventListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
      loadingScriptListeners.push(args);
      addEventListener.apply(window, args);
    });
    bootstrapLoadingScript();

    const root = document.getElementById('root');
    expect(root).not.toBeNull();

    const LazyPage = lazy(
      () =>
        new Promise<{ default: ComponentType }>(() => {
          // Hung chunk: never settles, so the error boundary never catches.
        })
    );

    render(
      <MemoryRouter>
        <ProtectedLazyRoute protected suspense="bare">
          <LazyPage />
        </ProtectedLazyRoute>
      </MemoryRouter>,
      { container: root as HTMLElement }
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(root?.getAttribute('data-app-ready')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(30300);
    });

    expect(document.getElementById('app-error')?.style.display).toBe('flex');
    expect(document.getElementById('retry-button')).not.toBeNull();
    expect(root?.getAttribute('data-app-ready')).not.toBe('true');
    expect(
      screen.queryByRole('heading', { name: 'This is taking too long' })
    ).not.toBeInTheDocument();
  });

  it('shows immediate recovery when a rejection follows splash-only dismissal', () => {
    createStartupShell();
    const addEventListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
      loadingScriptListeners.push(args);
      addEventListener.apply(window, args);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bootstrapLoadingScript();

    hideSplash();
    const loadingEl = document.getElementById('app-loading');
    const transitionEnd = new Event('transitionend');
    Object.defineProperty(transitionEnd, 'propertyName', { value: 'opacity' });
    loadingEl?.dispatchEvent(transitionEnd);

    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('startup rejection') });
    window.dispatchEvent(rejection);

    expect(document.getElementById('root')?.getAttribute('data-app-ready')).toBeNull();
    expect(document.getElementById('app-error')?.style.display).toBe('flex');
  });

  it('leaves a rejection nonfatal after the root is truly ready', () => {
    createStartupShell();
    const addEventListener = window.addEventListener;
    vi.spyOn(window, 'addEventListener').mockImplementation((...args) => {
      loadingScriptListeners.push(args);
      addEventListener.apply(window, args);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bootstrapLoadingScript();

    markAppReady();
    const rejection = new Event('unhandledrejection');
    Object.defineProperty(rejection, 'reason', { value: new Error('post-ready rejection') });
    window.dispatchEvent(rejection);

    expect(document.getElementById('app-error')?.style.display).not.toBe('flex');
    expect(document.getElementById('app-error')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows in-app PageLoading recovery after 30s when the app was already marked ready', () => {
    vi.useFakeTimers();
    createStartupShell();
    const root = document.getElementById('root');
    expect(root).not.toBeNull();
    root?.setAttribute('data-app-ready', 'true');
    document.getElementById('app-loading')?.remove();
    const errorEl = document.getElementById('app-error');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.setAttribute('aria-hidden', 'true');
    }

    const LazyPage = lazy(
      () =>
        new Promise<{ default: ComponentType }>(() => {
          // Hung chunk after a previous ready page (login form or recovered route).
        })
    );

    render(
      <MemoryRouter>
        <ProtectedLazyRoute protected suspense="bare">
          <LazyPage />
        </ProtectedLazyRoute>
      </MemoryRouter>,
      { container: root as HTMLElement }
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(screen.getByRole('heading', { name: 'This is taking too long' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(errorEl?.style.display).not.toBe('flex');
    expect(root?.getAttribute('data-app-ready')).toBe('true');
  });

  it('does not complete the failsafe while the auth spinner is up and the lazy child does not exist', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const overlay = document.createElement('div');
    overlay.id = 'app-loading';
    document.body.appendChild(overlay);
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    authState.user = null;
    authState.isLoading = true;
    authState.initialCheckComplete = false;

    let lazyFactoryCalled = false;
    const LazyPage = lazy(() => {
      lazyFactoryCalled = true;
      return new Promise<{ default: ComponentType }>(() => {});
    });

    render(
      <MemoryRouter>
        <ProtectedLazyRoute protected suspense="bare">
          <LazyPage />
        </ProtectedLazyRoute>
      </MemoryRouter>
    );

    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
    expect(root.getAttribute('data-app-ready')).toBeNull();
    expect(lazyFactoryCalled).toBe(false);
    expect(appLoadedCalls(dispatchSpy).length).toBeGreaterThan(0);
  });
});
