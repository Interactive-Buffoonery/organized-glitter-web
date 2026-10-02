import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SiteFooter } from '../SiteFooter';

describe('SiteFooter', () => {
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
    ]);
    expect(footerLinks[3]).toHaveAttribute('href', '/links');
    expect(footerLinks[4]).toHaveAttribute('href', 'https://updates.organizedglitter.app/');
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
});
