import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import SupportSuccess from '../SupportSuccess';

const renderPage = () =>
  render(
    <MemoryRouter>
      <SupportSuccess />
    </MemoryRouter>
  );

describe('SupportSuccess', () => {
  it('thanks a signed-out tipper, points to the Stripe receipt, and links home', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You made my day!');
    expect(screen.getByText(/with love/i)).toHaveTextContent(/sarah/i);
    expect(screen.getByText(/stripe will email you your receipt/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/paypal|donat/i);
    expect(screen.getByRole('link', { name: /back to organized glitter/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('returns a signed-in tipper to their library', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    renderPage();

    expect(screen.getByRole('link', { name: /back to library/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });
});
