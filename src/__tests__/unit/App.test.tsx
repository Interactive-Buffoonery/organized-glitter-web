import '@testing-library/jest-dom/vitest';
import type { FormEvent, ReactNode } from 'react';
import { afterAll, vi } from 'vitest';
import { act, describe, it, expect, beforeEach, waitFor } from '../../test-utils';
import { renderWithProviders, screen, userEvent } from '../../test-utils';

vi.mock('@/hooks/useAppInitialization', () => ({
  useAppInitialization: vi.fn(),
}));

const { mockFormSubmit, mockRegisterSW } = vi.hoisted(() => ({
  mockFormSubmit: vi.fn(),
  mockRegisterSW: vi.fn(() => vi.fn()),
}));

vi.mock('@/components/layout/AppProviders', () => ({
  AppProviders: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/routing/AppRoutes', () => ({
  AppRoutes: () => {
    const handleSubmit = (event: FormEvent) => {
      event.preventDefault();
      mockFormSubmit();
    };

    return (
      <form onSubmit={handleSubmit}>
        <label htmlFor="draft-name">Draft name</label>
        <input id="draft-name" />
      </form>
    );
  },
}));

vi.mock('@/components/onboarding', () => ({
  ColoringWalkthroughGate: () => <div data-testid="coloring-walkthrough-gate" />,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    criticalError: vi.fn(),
  }),
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: mockRegisterSW,
}));

const pocketBaseUrl = 'http://pocketbase.example.test';
vi.stubEnv('VITE_POCKETBASE_URL', pocketBaseUrl);
const { default: App } = await import('../../App');

afterAll(() => vi.unstubAllEnvs());

const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', {
    value: online,
    writable: true,
    configurable: true,
  });
};

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

describe('App', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let replaceSpy: ReturnType<typeof vi.fn>;
  let reloadSpy: ReturnType<typeof vi.fn>;
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let replaceStateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    replaceSpy = vi.fn();
    reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hash: '', replace: replaceSpy, reload: reloadSpy },
      writable: true,
      configurable: true,
    });
    pushStateSpy = vi.spyOn(window.history, 'pushState');
    replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    delete (window.navigator as Navigator & { serviceWorker?: ServiceWorkerContainer })
      .serviceWorker;
  });

  describe('Offline recovery', () => {
    it('preserves a mounted form through a failed check and successful reconnect', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const input = screen.getByRole('textbox', { name: 'Draft name' });
      await user.type(input, 'unfinished project');

      setOnline(false);
      await act(async () => {
        window.dispatchEvent(new Event('offline'));
      });

      expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
      expect(input).toHaveValue('unfinished project');

      setOnline(true);
      const failedCheck = deferred<Response>();
      const successfulCheck = deferred<Response>();
      fetchMock
        .mockReturnValueOnce(failedCheck.promise)
        .mockReturnValueOnce(successfulCheck.promise);

      await user.click(screen.getByRole('button', { name: 'Check connection' }));
      expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
      await act(async () => {
        failedCheck.resolve({ ok: false } as Response);
      });

      expect(
        await screen.findByText('Still unable to connect. Please try again.')
      ).toBeInTheDocument();
      expect(document.getElementById('draft-name')).toBe(input);
      expect(input).toHaveValue('unfinished project');

      await user.click(screen.getByRole('button', { name: 'Check connection' }));
      await act(async () => {
        successfulCheck.resolve({ ok: true } as Response);
      });

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
      await waitFor(() => expect(input).toHaveFocus());
      expect(screen.getByRole('textbox', { name: 'Draft name' })).toBe(input);
      expect(input).toHaveValue('unfinished project');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenLastCalledWith(
        `${pocketBaseUrl}/api/health`,
        expect.objectContaining({ method: 'GET', cache: 'no-store' })
      );
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(pushStateSpy).not.toHaveBeenCalled();
      expect(replaceStateSpy).not.toHaveBeenCalled();
      expect(mockFormSubmit).not.toHaveBeenCalled();
    });

    it('keeps the overlay visible until an automatic reconnect check succeeds', async () => {
      let resolveHealthCheck: (response: Response) => void = () => undefined;
      fetchMock.mockReturnValue(
        new Promise<Response>(resolve => {
          resolveHealthCheck = resolve;
        })
      );
      setOnline(false);
      renderWithProviders(<App />);

      setOnline(true);
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      expect(await screen.findByRole('button', { name: 'Checking…' })).toBeDisabled();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      await act(async () => {
        resolveHealthCheck({ ok: true } as Response);
      });

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('PWA registration', () => {
    it('registers the service worker with immediate update checks', async () => {
      Object.defineProperty(window.navigator, 'serviceWorker', {
        value: {},
        writable: true,
        configurable: true,
      });
      renderWithProviders(<App />);

      await waitFor(() => {
        expect(mockRegisterSW).toHaveBeenCalledWith(
          expect.objectContaining({
            immediate: true,
            onRegisteredSW: expect.any(Function),
          })
        );
      });
    });
  });

  describe('Password reset redirect', () => {
    it('redirects valid hash-based password reset URLs to path-based', () => {
      window.location.hash = '#/auth/confirm-password-reset/abc123token99';
      renderWithProviders(<App />);

      expect(replaceSpy).toHaveBeenCalledWith('/auth/confirm-password-reset/abc123token99');
    });

    it('handles tokens with hyphens and underscores', () => {
      window.location.hash = '#/auth/confirm-password-reset/abc-123_token99';
      renderWithProviders(<App />);

      expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining('confirm-password-reset/'));
    });

    it('preserves valid dot-separated PocketBase tokens', () => {
      window.location.hash = '#/auth/confirm-password-reset/header.payload.signature';
      renderWithProviders(<App />);

      expect(replaceSpy).toHaveBeenCalledWith(
        '/auth/confirm-password-reset/header.payload.signature'
      );
    });

    it('does not redirect non-password-reset hashes', () => {
      window.location.hash = '#/some-other-route';
      renderWithProviders(<App />);

      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('does not throw or redirect when the location hash is empty', () => {
      window.location.hash = '';

      expect(() => renderWithProviders(<App />)).not.toThrow();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('does not redirect nested or malformed token segments', () => {
      window.location.hash = '#/auth/confirm-password-reset/header/payload';
      renderWithProviders(<App />);

      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });
});
