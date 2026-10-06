import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/constants/updates', () => ({ UPDATES_URL: 'https://site.example.test/updates/' }));

import { SiteFooter } from '../SiteFooter';

describe('SiteFooter', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('links to the public pages with Links after About', () => {
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    );

    const footerLinks = within(screen.getByRole('contentinfo')).getAllByRole('link');

    expect(footerLinks.map(link => link.textContent)).toEqual([
      'Privacy',
      'Terms',
      'About',
      'Links',
      'Updates',
      'Source code',
    ]);
    expect(footerLinks[3]).toHaveAttribute('href', '/links');
    expect(footerLinks[4]).toHaveAttribute('href', 'https://site.example.test/updates/');
  });

  it('marks Links as the current page instead of linking to itself', () => {
    render(
      <MemoryRouter>
        <SiteFooter currentPage="Links" />
      </MemoryRouter>
    );

    expect(screen.getByText('Links')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Links' })).not.toBeInTheDocument();
  });

  it('adds an understated Support link only when tips are configured', () => {
    vi.stubEnv('VITE_STRIPE_TIP_CUSTOM_URL', 'https://buy.stripe.com/test_custom');
    render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Support' })).toHaveAttribute('href', '/support');
  });
});
