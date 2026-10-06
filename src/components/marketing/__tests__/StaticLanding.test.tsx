import { describe, expect, it } from 'vitest';

import { renderStaticLanding } from '../StaticLanding';

const renderDocument = () =>
  new DOMParser().parseFromString(`<body>${renderStaticLanding()}</body>`, 'text/html');

describe('renderStaticLanding', () => {
  it('renders the home page content without JavaScript', () => {
    const html = renderStaticLanding();
    const document = renderDocument();

    expect(document.querySelector('h1')?.textContent).toBe(
      'Organize your coloring books and diamond art'
    );
    expect(document.querySelector('#features')).not.toBeNull();
    expect(document.body.textContent).toContain("hi, I'm Sarah!");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('opacity-0');
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps the signed-out header, skip link, and main landmark', () => {
    const document = renderDocument();
    const header = document.querySelector('header[aria-label="Site header"]');
    const link = (name: string) =>
      [...(header?.querySelectorAll('a') ?? [])].find(anchor => anchor.textContent === name);

    expect(document.querySelector('a[href="#main-content"]')?.textContent).toBe('Skip to content');
    expect(document.querySelector('main#main-content')?.getAttribute('tabindex')).toBe('-1');
    expect(
      header?.querySelector('a[aria-label="Organized Glitter home"]')?.getAttribute('href')
    ).toBe('/');
    expect(link('Login')?.getAttribute('href')).toBe('/login');
    expect(link('Get Started')?.getAttribute('href')).toBe('/register');
  });

  it('preserves the hosting notice without nonfunctional no-JavaScript controls', () => {
    const document = renderDocument();
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
    const hrefs = [...renderDocument().querySelectorAll('a')].map(anchor =>
      anchor.getAttribute('href')
    );

    expect(hrefs).toEqual(
      expect.arrayContaining(['/register', '#features', '/about', '/privacy', '/terms', '/links'])
    );
  });
});
