import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCapture } = vi.hoisted(() => ({ mockCapture: vi.fn() }));
vi.mock('@posthog/react', () => ({ usePostHog: () => ({ capture: mockCapture }) }));
vi.mock('@/hooks/useAppReady', () => ({ useAppReady: vi.fn() }));
vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

import Support from '../Support';

// jsdom cannot follow links; stop the default so clicks only exercise the handlers.
const preventNavigation = (event: MouseEvent) => event.preventDefault();

const renderPage = () =>
  render(
    <MemoryRouter>
      <Support />
    </MemoryRouter>
  );

describe('Support page', () => {
  beforeEach(() => document.addEventListener('click', preventNavigation));
  afterEach(() => {
    document.removeEventListener('click', preventNavigation);
    vi.unstubAllEnvs();
    mockCapture.mockClear();
  });

  it('offers each configured one-time tip and a custom amount', () => {
    vi.stubEnv('VITE_STRIPE_TIP_2_URL', 'https://buy.stripe.com/test_2');
    vi.stubEnv('VITE_STRIPE_TIP_3_URL', 'https://buy.stripe.com/test_3');
    vi.stubEnv('VITE_STRIPE_TIP_5_URL', 'https://buy.stripe.com/test_5');
    vi.stubEnv('VITE_STRIPE_TIP_10_URL', 'https://buy.stripe.com/test_10');
    vi.stubEnv('VITE_STRIPE_TIP_CUSTOM_URL', 'https://buy.stripe.com/test_custom');
    renderPage();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Support Organized Glitter'
    );
    for (const amount of [2, 3, 10]) {
      expect(screen.getByRole('link', { name: `Tip $${amount}` })).toHaveAttribute(
        'href',
        `https://buy.stripe.com/test_${amount}`
      );
    }
    expect(screen.getByRole('link', { name: 'Tip $5 (most popular)' })).toHaveAttribute(
      'href',
      'https://buy.stripe.com/test_5'
    );
    expect(screen.getByRole('link', { name: 'Choose your own amount' })).toHaveAttribute(
      'href',
      'https://buy.stripe.com/test_custom'
    );
    expect(screen.getByText(/hosting, the database, the domain/i)).toBeInTheDocument();
    expect(screen.getByText(/free for everyone/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/donat|subscri|unlock/i);
  });

  it('offers free ways to help', () => {
    vi.stubEnv('VITE_SUPPORT_URL', 'https://example.test/feedback');
    vi.stubEnv('VITE_APP_STORE_URL', 'https://apps.apple.com/app/id123');
    renderPage();

    expect(screen.getByRole('heading', { name: 'Other ways to help' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send feedback' })).toHaveAttribute(
      'href',
      'https://example.test/feedback'
    );
    expect(screen.getByText(/tell a crafting friend/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /review on the app store/i })).toHaveAttribute(
      'href',
      'https://apps.apple.com/app/id123'
    );
    expect(screen.getByText(/thanks for being here/i)).toBeInTheDocument();
  });

  it('records which tip amount was chosen without any payment details', () => {
    vi.stubEnv('VITE_STRIPE_TIP_5_URL', 'https://buy.stripe.com/test_5');
    vi.stubEnv('VITE_STRIPE_TIP_CUSTOM_URL', 'https://buy.stripe.com/test_custom');
    renderPage();

    fireEvent.click(screen.getByRole('link', { name: 'Tip $5 (most popular)' }));
    fireEvent.click(screen.getByRole('link', { name: 'Choose your own amount' }));

    const beacon = { send_instantly: true, transport: 'sendBeacon' };
    expect(mockCapture).toHaveBeenNthCalledWith(1, 'tip_link_clicked', { amount: 5 }, beacon);
    expect(mockCapture).toHaveBeenNthCalledWith(
      2,
      'tip_link_clicked',
      { amount: 'custom' },
      beacon
    );
  });

  it('records clicks on the other ways to help', () => {
    vi.stubEnv('VITE_SUPPORT_URL', 'https://example.test/feedback');
    vi.stubEnv('VITE_APP_STORE_URL', 'https://apps.apple.com/app/id123');
    renderPage();

    fireEvent.click(screen.getByRole('link', { name: 'Send feedback' }));
    fireEvent.click(screen.getByRole('link', { name: /review on the app store/i }));

    const beacon = { send_instantly: true, transport: 'sendBeacon' };
    expect(mockCapture).toHaveBeenNthCalledWith(
      1,
      'support_alternative_clicked',
      { action: 'feedback' },
      beacon
    );
    expect(mockCapture).toHaveBeenNthCalledWith(
      2,
      'support_alternative_clicked',
      { action: 'app_store_review' },
      beacon
    );
  });

  it('hides the App Store review when no App Store link is configured', () => {
    renderPage();

    expect(screen.queryByRole('link', { name: /app store/i })).not.toBeInTheDocument();
  });

  it('shows a quiet note and no payment links when tips are not configured', () => {
    renderPage();

    expect(screen.getByText(/tips are not available on this site/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Tip \$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Choose your own amount' })).not.toBeInTheDocument();
  });
});
