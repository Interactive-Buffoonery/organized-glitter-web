import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preview } from 'vite';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { promoteStaticPages, staticPages } from '../static-pages.mjs';

const appHtml =
  '<head><link rel="stylesheet" crossorigin href="/assets/main-abc.css"></head><body><script type="module" src="/assets/main.js"></script></body>';
const pageHtml = heading =>
  `<head><!-- og-app-stylesheet --></head><body><h1>${heading}</h1></body>`;
const critical = '@layer og-critical { body { margin: 0; } }';
const styled = heading =>
  `<head><style>\n${critical}\n</style>\n    <link rel="stylesheet" crossorigin href="/assets/main-abc.css"></head><body><h1>${heading}</h1></body>`;

function bundleFixture() {
  return {
    'index.html': { type: 'asset', fileName: 'index.html', source: appHtml },
    'landing.html': { type: 'asset', fileName: 'landing.html', source: pageHtml('Hi') },
    'privacy.html': { type: 'asset', fileName: 'privacy.html', source: pageHtml('Privacy') },
    'about.html': { type: 'asset', fileName: 'about.html', source: appHtml },
  };
}

describe('promoteStaticPages', () => {
  it('serves the landing as index.html and moves the SPA shell to app.html', () => {
    const bundle = bundleFixture();
    const emitFile = vi.fn();

    promoteStaticPages(bundle, emitFile, critical);

    expect(Object.keys(bundle)).toEqual(['privacy.html', 'about.html']);
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: 'app.html',
      source: appHtml,
    });
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: 'index.html',
      source: styled('Hi'),
    });
  });

  it('styles other static pages with critical CSS below the app stylesheet', () => {
    const bundle = bundleFixture();

    promoteStaticPages(bundle, vi.fn(), critical);

    expect(bundle['privacy.html'].source).toBe(styled('Privacy'));
    expect(bundle['about.html'].source).toBe(appHtml);
  });

  it('fails the build when the app stylesheet is missing', () => {
    const bundle = bundleFixture();
    bundle['index.html'].source = '<head></head>';

    expect(() => promoteStaticPages(bundle, vi.fn(), critical)).toThrow(/app stylesheet/);
  });
});

describe('static page templates', () => {
  const parse = file => new JSDOM(readFileSync(file, 'utf8')).window.document;
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
    expect(metadata(parse('landing.html'))).toEqual(metadata(parse('index.html')));
  });

  it.each([
    ['privacy.html', 'Privacy policy | Organized Glitter', '/privacy'],
    ['terms.html', 'Terms of service | Organized Glitter', '/terms'],
  ])('keeps %s page metadata', (file, title, path) => {
    const document = parse(file);

    expect(document.title).toBe(title);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `https://app.invalid${path}`
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      title
    );
  });

  it.each(['landing.html', 'privacy.html', 'terms.html'])(
    '%s loads no app scripts or startup shell',
    file => {
      const document = parse(file);
      const html = readFileSync(file, 'utf8');

      expect(document.querySelector('script[type="module"]')).toBeNull();
      expect(document.querySelector('script[src*="/js/"]')).toBeNull();
      expect(
        [...document.querySelectorAll('link[href*="/css/"]')].map(link => link.getAttribute('href'))
      ).toEqual(['/css/safe-area.css?v=6']);
      expect(document.querySelector('#root, #app-loading, #app-error')).toBeNull();
      expect(html).toContain('<!-- og-app-stylesheet -->');
      expect(html).toContain('<!-- og-static-page -->');
      expect(document.querySelector('meta[name="theme-color"]')).not.toBeNull();
    }
  );
});

describe('built preview routing', () => {
  it('preserves static pages, serves known app routes, and returns unknown 404s', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'og-static-preview-'));
    await Promise.all(
      ['index', 'privacy', 'terms', 'app', '404'].map(name =>
        writeFile(path.join(directory, `${name}.html`), `<main>${name}</main>`)
      )
    );
    const server = await preview({
      configFile: false,
      root: directory,
      build: { outDir: directory },
      plugins: staticPages(),
      preview: { host: '127.0.0.1', port: 0 },
    });
    try {
      const port = server.httpServer.address().port;
      for (const [route, body, status] of [
        ['/', 'index', 200],
        ['/privacy', 'privacy', 200],
        ['/terms/', 'terms', 200],
        ['/login?next=/overview', 'app', 200],
        ['/overview', 'app', 200],
        ['/coloring/book/pages/page', 'app', 200],
        ['/unknown-route', '404', 404],
      ]) {
        const response = await fetch(`http://127.0.0.1:${port}${route}`);
        expect(response.status, route).toBe(status);
        expect(await response.text(), route).toBe(`<main>${body}</main>`);
      }
    } finally {
      await server.close();
      execFileSync('trash', [directory]);
    }
  });
});
