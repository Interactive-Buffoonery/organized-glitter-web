import '@testing-library/jest-dom/vitest';
import React from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders, waitFor, describe, it, expect, beforeEach } from '../../test-utils';

const { navigateMock, toastMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="main-layout">{children}</div>
  ),
}));

vi.mock('@/lib/notifications', () => ({
  notify: toastMock,
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

import ResetPassword from '../ResetPassword';

describe('ResetPassword compatibility route', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    toastMock.mockReset();

    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
      configurable: true,
    });
  });

  it('redirects valid legacy tokens to the canonical reset route', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?token=abc123token99' },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<ResetPassword />, {
      initialRoute: '/reset-password?token=abc123token99',
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/auth/confirm-password-reset/abc123token99', {
        replace: true,
      });
    });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('redirects missing tokens to forgot password with an error toast', async () => {
    renderWithProviders(<ResetPassword />);

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'error',
          title: 'Invalid or expired link',
        })
      );
      expect(navigateMock).toHaveBeenCalledWith('/forgot-password', { replace: true });
    });
  });

  it('retains the token when a redirect changes the URL before effects replay', async () => {
    window.location.search = '?token=header.payload.signature';
    navigateMock.mockImplementation(() => {
      window.location.search = '';
    });

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={['/reset-password?token=header.payload.signature']}>
          <ResetPassword />
        </MemoryRouter>
      </React.StrictMode>
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        '/auth/confirm-password-reset/header.payload.signature',
        { replace: true }
      );
    });
    expect(navigateMock).not.toHaveBeenCalledWith('/forgot-password', { replace: true });
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('preserves valid dot-separated PocketBase tokens', async () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?token=header.payload.signature' },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<ResetPassword />, {
      initialRoute: '/reset-password?token=header.payload.signature',
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        '/auth/confirm-password-reset/header.payload.signature',
        { replace: true }
      );
    });
  });
});
