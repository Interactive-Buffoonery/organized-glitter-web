import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { promoteStaticLanding } from '../static-landing.mjs';

const appHtml =
  '<head><link rel="stylesheet" crossorigin href="/assets/main-abc.css"></head><body><script type="module" src="/assets/main.js"></script></body>';
const landingHtml = '<head><!-- og-app-stylesheet --></head><body><h1>Hi</h1></body>';

function bundleFixture() {
  return {
    'index.html': { type: 'asset', fileName: 'index.html', source: appHtml },
    'landing.html': { type: 'asset', fileName: 'landing.html', source: landingHtml },
  };
}

describe('promoteStaticLanding', () => {
  it('serves the landing as index.html and moves the SPA shell to app.html', () => {
    const bundle = bundleFixture();
    const emitFile = vi.fn();

    promoteStaticLanding(bundle, emitFile);

    expect(bundle).toEqual({});
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: 'app.html',
      source: appHtml,
    });
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: 'index.html',
      source:
        '<head><link rel="stylesheet" crossorigin href="/assets/main-abc.css"></head><body><h1>Hi</h1></body>',
    });
  });

  it('fails the build when the app stylesheet is missing', () => {
    const bundle = bundleFixture();
    bundle['index.html'].source = '<head></head>';

    expect(() => promoteStaticLanding(bundle, vi.fn())).toThrow(/app stylesheet/);
  });
});

describe('landing.html template', () => {
  const parse = file => new JSDOM(readFileSync(file, 'utf8')).window.document;
  const landing = parse('landing.html');
  const app = parse('index.html');
  const metadata = document =>
    [
      'title',
      'meta[name="description"]',
      'link[rel="canonical"]',
      'meta[property^="og:"]',
      'meta[name^="twitter:"]',
      'script[type="application/ld+json"]',
    ].flatMap(selector => [...document.querySelectorAll(selector)].map(node => node.outerHTML));

  it('shares the home metadata with the app shell', () => {
    expect(metadata(landing)).toEqual(metadata(app));
  });

  it('loads no app scripts or startup shell', () => {
    expect(landing.querySelector('script[type="module"]')).toBeNull();
    expect(landing.querySelector('script[src*="/js/"]')).toBeNull();
    expect(landing.querySelector('#root, #app-loading, #app-error')).toBeNull();
  });

  it('keeps critical styles below the app stylesheet', () => {
    const head = readFileSync('landing.html', 'utf8');
    expect(head.indexOf('@layer og-critical')).toBeGreaterThan(-1);
    expect(head.indexOf('@layer og-critical')).toBeLessThan(
      head.indexOf('<!-- og-app-stylesheet -->')
    );
  });
});
