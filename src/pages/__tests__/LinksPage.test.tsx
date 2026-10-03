import '@testing-library/jest-dom/vitest';
import React from 'react';
import { within } from '@testing-library/react';
import { afterAll, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithProviders, screen, describe, it, expect } from '../../test-utils';

vi.mock('@/components/layout/MainLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main data-testid="main-layout">{children}</main>
  ),
}));

vi.mock('@/hooks/useAppReady', () => ({
  useAppReady: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

const appUrl = 'https://app.example.test';
vi.stubEnv('VITE_APP_URL', appUrl);
const { default: LinksPage } = await import('../LinksPage');

afterAll(() => vi.unstubAllEnvs());

describe('LinksPage', () => {
  it('renders link cards as native links instead of mouse-only card containers', () => {
    const { container } = renderWithProviders(<LinksPage />, { initialRoute: '/links' });
    const cardActions = screen.getByTestId('links-page-card-actions');
    const cardActionLinks = within(cardActions).getAllByRole('link');

    expect(cardActionLinks).toHaveLength(4);
    expect(screen.getByRole('link', { name: /Try Organized Glitter/i })).toHaveAttribute(
      'href',
      new URL('/', appUrl).href
    );
    expect(screen.getByRole('link', { name: /26 for 26/i })).toHaveAttribute(
      'href',
      'https://youtu.be/CRzIQbnZ9Ao?si=FS31lZA81dU7Dbot'
    );
    expect(screen.getByRole('link', { name: /^ArtDot/i })).toHaveAttribute(
      'href',
      expect.stringContaining('https://www.artdot.com')
    );
    expect(screen.getByRole('link', { name: /Lireka/i })).toHaveAttribute(
      'href',
      'https://www.lireka.com/en'
    );

    expect(within(cardActions).queryByRole('button')).not.toBeInTheDocument();
    expect(cardActions.querySelectorAll('a button, button a')).toHaveLength(0);
    expect(cardActions.querySelectorAll('div[onclick]')).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-testid="links-page-card-actions"] > section > a')
    ).toHaveLength(4);
  });

  it('renders the Instagram destination as a native external link', () => {
    renderWithProviders(<LinksPage />, { initialRoute: '/links' });

    expect(screen.getByRole('link', { name: /Follow on Instagram/i })).toHaveAttribute(
      'href',
      'https://www.instagram.com/organized_glitter'
    );
  });

  it('inherits the selected theme without glass or gradients', async () => {
    const { container } = renderWithProviders(<LinksPage />, { initialRoute: '/links' });
    const page = screen.getByTestId('main-layout');

    expect(page).not.toHaveAttribute('data-theme');
    expect(container.querySelector('.backdrop-blur')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/gradient|glass/i);
    expect(document.title).toBe("Sarah's Links | Organized Glitter");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      new URL('/links', appUrl).href
    );
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      new URL('/links', appUrl).href
    );
    expect(
      document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"][data-page-metadata-id="links-page-structured-data"]'
      )?.textContent
    ).toContain('"@type":"CollectionPage"');
    await expect(
      await axe(container, { rules: { 'color-contrast': { enabled: false } } })
    ).toHaveNoViolations();
  });

  it('paints the padded app shell opaque so /links cannot leak page atmosphere', () => {
    const { unmount } = renderWithProviders(<LinksPage />, { initialRoute: '/links' });

    expect(document.documentElement).toHaveClass('utility-register');
    unmount();
    expect(document.documentElement).not.toHaveClass('utility-register');
  });
});
