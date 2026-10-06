import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/hooks/usePageMetadata', () => ({ usePageMetadata: vi.fn() }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import About from '../About';

const renderAbout = () =>
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>
  );

describe('About', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('links to the support page when tips are configured', () => {
    vi.stubEnv('VITE_STRIPE_TIP_5_URL', 'https://buy.stripe.com/test_5');
    renderAbout();

    expect(screen.getByRole('link', { name: 'Support Organized Glitter' })).toHaveAttribute(
      'href',
      '/support'
    );
  });

  it('hides the support link when tips are not configured', () => {
    vi.stubEnv('VITE_STRIPE_TIP_2_URL', '');
    vi.stubEnv('VITE_STRIPE_TIP_3_URL', '');
    vi.stubEnv('VITE_STRIPE_TIP_5_URL', '');
    vi.stubEnv('VITE_STRIPE_TIP_10_URL', '');
    vi.stubEnv('VITE_STRIPE_TIP_CUSTOM_URL', '');
    renderAbout();

    expect(
      screen.queryByRole('link', { name: 'Support Organized Glitter' })
    ).not.toBeInTheDocument();
  });
});
