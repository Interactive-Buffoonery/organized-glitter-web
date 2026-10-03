import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePageMetadata } from '../usePageMetadata';

describe('usePageMetadata', () => {
  it('updates the document title and description, then restores them on unmount', () => {
    document.head.innerHTML = `
      <title>Organized Glitter - Your Diamond Art Progress Tracker</title>
      <meta name="description" content="Default description" />
    `;

    const { unmount } = renderHook(() =>
      usePageMetadata({
        title: 'Privacy Policy | Organized Glitter',
        description: 'Privacy details for Organized Glitter users.',
      })
    );

    const description = document.querySelector('meta[name="description"]');

    expect(document.title).toBe('Privacy Policy | Organized Glitter');
    expect(description).not.toBeNull();
    expect(description?.getAttribute('content')).toBe(
      'Privacy details for Organized Glitter users.'
    );

    unmount();

    expect(document.title).toBe('Organized Glitter - Your Diamond Art Progress Tracker');
    expect(description?.getAttribute('content')).toBe('Default description');
  });

  it('creates and removes the description tag when one was not already present', () => {
    document.head.innerHTML = '<title>Original title</title>';

    const { unmount } = renderHook(() =>
      usePageMetadata({
        title: 'Changelog | Organized Glitter',
        description: 'Release notes for Organized Glitter.',
      })
    );

    expect(document.title).toBe('Changelog | Organized Glitter');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Release notes for Organized Glitter.'
    );

    unmount();

    expect(document.title).toBe('Original title');
    expect(document.querySelector('meta[name="description"]')).toBeNull();
  });

  it('updates route-level SEO metadata and restores previous tags', () => {
    document.head.innerHTML = `
      <title>Original title</title>
      <link rel="canonical" href="https://organizedglitter.app/" />
      <meta property="og:title" content="Original OG title" />
    `;

    const { unmount } = renderHook(() =>
      usePageMetadata({
        title: "Sarah's Links | Organized Glitter",
        description: "Sarah's current Organized Glitter links.",
        canonicalUrl: 'https://organizedglitter.app/links',
        openGraph: {
          type: 'website',
          image: 'https://organizedglitter.app/images/og-image.jpg',
          imageAlt: 'Organized Glitter social preview',
        },
        twitter: {
          card: 'summary_large_image',
        },
        structuredData: {
          id: 'links-page-structured-data',
          data: {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: "Sarah's Links | Organized Glitter",
          },
        },
      })
    );

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://organizedglitter.app/links'
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      "Sarah's Links | Organized Glitter"
    );
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe(
      'website'
    );
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe(
      'summary_large_image'
    );
    expect(
      document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"][data-page-metadata-id="links-page-structured-data"]'
      )?.textContent
    ).toContain('"@type":"CollectionPage"');

    unmount();

    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://organizedglitter.app/'
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Original OG title'
    );
    expect(document.querySelector('meta[property="og:type"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:card"]')).toBeNull();
    expect(
      document.querySelector(
        'script[type="application/ld+json"][data-page-metadata-id="links-page-structured-data"]'
      )
    ).toBeNull();
  });

  it('adds route-level robots metadata and removes it on unmount', () => {
    document.head.innerHTML = '<title>Original title</title>';

    const { unmount } = renderHook(() =>
      usePageMetadata({
        title: 'Login | Organized Glitter',
        robots: 'noindex, nofollow',
      })
    );

    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );

    unmount();

    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
