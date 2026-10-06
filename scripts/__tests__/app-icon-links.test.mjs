import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_ICON_VERSION, injectAppIconLinks } from '../app-icon-links.mjs';

// Direct visits to every HTML entry must use the same current icon URLs.
const pages = [
  'index.html',
  'landing.html',
  'about.html',
  'links.html',
  'privacy.html',
  'terms.html',
];

describe('shared app icon links', () => {
  it.each(pages)('%s serves the current favicon and touch icon', file => {
    const html = injectAppIconLinks(readFileSync(file, 'utf8'));
    const document = new DOMParser().parseFromString(html, 'text/html');
    const links = [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')];
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      ['site-icon.ico', 'site-icon-32x32.png', 'site-icon-16x16.png', 'site-touch-icon.png'].map(
        name => `/${name}?v=${APP_ICON_VERSION}`
      )
    );
    expect(html).not.toContain('<!-- og-app-icons -->');
    expect(html).not.toContain('blush-aubergine-1');
  });

  it('leaves unrelated HTML unchanged', () => {
    const html = '<html><head><title>Preview</title></head></html>';
    expect(injectAppIconLinks(html)).toBe(html);
  });
});
