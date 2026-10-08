import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PrivacyPolicy } from '@/components/legal/PrivacyPolicy';
import { TermsOfService } from '@/components/legal/TermsOfService';
import { renderStaticPage } from '../StaticPages';

const renderDocument = (page: string) =>
  new DOMParser().parseFromString(`<body>${renderStaticPage(page)}</body>`, 'text/html');

describe('renderStaticPage', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['', 'support@example.com'])('preserves the underage policy with contact %s', email => {
    vi.stubEnv('VITE_CONTACT_EMAIL', email);
    const privacy = renderDocument('privacy');
    const terms = renderDocument('terms');
    const section = [...privacy.querySelectorAll('section')].find(
      node => node.querySelector('h2')?.textContent === "Children's Privacy"
    );
    expect(section?.querySelector('p')?.textContent).toBe(
      "Organized Glitter is for people age 13 and older. If you believe someone under 13 has an account, please contact us. If we confirm that an account belongs to someone under 13, we'll close it and delete their personal information."
    );
    expect(section?.querySelector('a')?.getAttribute('href')).toBe(
      email ? 'mailto:support@example.com?subject=Underage%20account%20report' : '#privacy-contact'
    );
    expect(privacy.querySelector('#privacy-contact h2')?.textContent).toBe('Contact');
    expect(terms.querySelector('#user-accounts p')?.textContent).toBe(
      'You must be at least 13 to create an account.'
    );
    for (const document of [privacy, terms]) {
      expect(document.body.textContent).toContain('Last updated: October 6, 2026');
    }
  });
  it('preserves the account-linked analytics policy', () => {
    const document = renderDocument('privacy');
    const analytics = [...document.querySelectorAll('li')].find(
      node => node.querySelector('strong')?.textContent === 'Product analytics:'
    );
    expect(analytics?.textContent).toBe(
      "Product analytics: page views, feature usage, and error data collected through PostHog. When you're signed in, this activity is linked to your account ID."
    );
    const services = [...document.querySelectorAll('section')].find(
      node => node.querySelector('h2')?.textContent === 'Third-Party Services'
    );
    expect(services?.querySelector('p')?.textContent).toBe(
      "PostHog Analytics. We use PostHog to see which parts of Organized Glitter are used and to help find problems. When you're signed in, this activity is linked to your account ID. PostHog respects the Do Not Track browser setting. We do not use PostHog for advertising, session recording, or automatic click tracking. We only send specific product events we have chosen to measure, such as page views and feature usage. We do not send your name, email address, craft titles, notes, or photos as product analytics. You can turn off usage analytics and error reports in Account settings under Privacy. This choice is saved to your account and applies across signed-in devices."
    );
  });

  it('renders the home page content without JavaScript', () => {
    const html = renderStaticPage('landing');
    const document = renderDocument('landing');

    expect(document.querySelector('h1')?.textContent).toBe(
      'Organize your coloring books and diamond art'
    );
    expect(document.querySelector('#features')).not.toBeNull();
    expect(document.body.textContent).toContain("hi, I'm Sarah!");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('opacity-0');
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });

  it.each(['landing', 'privacy', 'terms'])(
    'keeps the signed-out header, skip link, and main landmark on %s',
    page => {
      const document = renderDocument(page);
      expect(document.querySelector('[data-static-page] main#main-content')).not.toBeNull();
      expect(document.querySelector('[data-static-landing]') !== null).toBe(page === 'landing');
      const header = document.querySelector('header[aria-label="Site header"]');
      const link = (name: string) =>
        [...(header?.querySelectorAll('a') ?? [])].find(anchor => anchor.textContent === name);

      expect(document.querySelector('a[href="#main-content"]')?.textContent).toBe(
        'Skip to content'
      );
      expect(document.querySelector('main#main-content')?.getAttribute('tabindex')).toBe('-1');
      expect(
        header?.querySelector('a[aria-label="Organized Glitter home"]')?.getAttribute('href')
      ).toBe('/');
      expect(link('Login')?.getAttribute('href')).toBe('/login');
      expect(link('Get Started')?.getAttribute('href')).toBe('/register');
      expect(document.querySelector('footer')).not.toBeNull();
      expect(renderStaticPage(page)).not.toContain('<script');
      expect(document.querySelectorAll('button')).toHaveLength(0);
    }
  );

  it('preserves the hosting notice without nonfunctional no-JavaScript controls', () => {
    const document = renderDocument('landing');
    const notice = document.querySelector('[data-notice-id="weekend-hosting"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('Hosting update this weekend');
    expect(notice?.querySelector('strong')?.textContent).toBe(
      "If you don't see your projects, sign out and back in."
    );
    expect(notice?.querySelector('button')).toBeNull();
    expect(notice?.compareDocumentPosition(document.querySelector('#main-content')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('links to app and public routes with plain anchors', () => {
    const hrefs = [...renderDocument('landing').querySelectorAll('a')].map(anchor =>
      anchor.getAttribute('href')
    );

    expect(hrefs).toEqual(
      expect.arrayContaining(['/register', '#features', '/about', '/privacy', '/terms', '/links'])
    );
  });

  it.each([
    ['privacy', 'Privacy Policy', 'Privacy', <PrivacyPolicy />],
    ['terms', 'Terms of Service', 'Terms', <TermsOfService />],
  ])('renders the shared %s content inside main', (page, heading, footerLabel, content) => {
    const document = renderDocument(page);
    const main = document.querySelector('main#main-content');
    const { container } = render(<MemoryRouter>{content}</MemoryRouter>);

    expect(main?.querySelector('h1')?.textContent).toBe(heading);
    expect(main?.innerHTML).toBe(container.innerHTML);
    expect(
      document.querySelector(`footer [aria-current="page"]`)?.textContent,
      'the footer marks the current legal page'
    ).toBe(footerLabel);
  });

  it('links from the terms to the privacy policy with a plain anchor', () => {
    const main = renderDocument('terms').querySelector('main');

    expect(main?.querySelector('a[href="/privacy"]')?.textContent).toBe(
      'the privacy policy for this instance'
    );
  });

  it('rejects pages without a static renderer', () => {
    expect(() => renderStaticPage('about')).toThrow(/No static page for about/);
  });
});
