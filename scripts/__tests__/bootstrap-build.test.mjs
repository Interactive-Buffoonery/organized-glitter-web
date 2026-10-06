import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { rewriteBootstrapHtml } from '../bootstrap-build.mjs';
import { promoteStaticPages } from '../static-pages.mjs';

const chunk = (fileName, imports = [], css = []) => ({
  type: 'chunk',
  fileName,
  imports,
  dynamicImports: [],
  viteMetadata: { importedCss: new Set(css) },
});
const html = `<head><title>Keep metadata</title><meta name="description" content="Keep me">
<script type="module" crossorigin src="/assets/vendor.js"></script>
<script type="module" crossorigin src="/assets/main.js"></script>
<link rel="modulepreload" href="/assets/vendor.js">
<link rel="stylesheet" crossorigin href="/assets/main.css">
<link rel="stylesheet" href="/css/error.css?v=8">
<script src="/js/loading.js?v=10" defer></script>
<script src="/js/bootstrap-analytics.js?v=2" defer></script>
</head><body><div id="root"></div><div id="app-error"></div></body>`;
function fixture() {
  return {
    'assets/main.js': chunk('assets/main.js', ['assets/vendor.js'], ['assets/main.css']),
    'assets/vendor.js': chunk('assets/vendor.js', ['assets/shared.js']),
    'assets/shared.js': chunk('assets/shared.js', ['assets/vendor.js'], ['assets/shared.css']),
    'assets/lazy.js': chunk('assets/lazy.js', ['assets/vendor.js'], ['assets/lazy.css']),
    ...Object.fromEntries(
      ['main', 'shared', 'lazy'].map(name => [
        `assets/${name}.css`,
        { type: 'asset', fileName: `assets/${name}.css`, source: '' },
      ])
    ),
  };
}
const sources = file => `/* ${file} */`;
const parse = value => new JSDOM(value).window.document;
const config = document =>
  JSON.parse(document.getElementById('app-bootstrap-resources').textContent);

describe('bootstrap build integration', () => {
  it('emits the recursive static graph once and keeps lazy graphs inert', () => {
    const document = parse(rewriteBootstrapHtml(html, fixture(), sources));
    const data = config(document);
    expect(data.entry).toBe('/assets/main.js');
    expect(new Set(data.resources)).toEqual(
      new Set([
        '/assets/main.js',
        '/assets/vendor.js',
        '/assets/shared.js',
        '/assets/main.css',
        '/assets/shared.css',
      ])
    );
    expect(data.resources).not.toContain('/assets/lazy.js');
    expect(data.resources).not.toContain('/assets/lazy.css');
    expect(new Set(data.graphs['/assets/lazy.js'])).toEqual(
      new Set([
        '/assets/lazy.js',
        '/assets/lazy.css',
        '/assets/vendor.js',
        '/assets/shared.js',
        '/assets/shared.css',
      ])
    );
    expect(
      document.querySelector(
        'script[type="module"], link[rel="modulepreload"], link[href^="/assets/"]'
      )
    ).toBeNull();
  });

  it('keeps the critical shell local, parsed before startup, and initialized once', () => {
    const result = rewriteBootstrapHtml(html, fixture(), sources);
    const document = parse(result);
    expect(document.querySelector('script[src], link[href^="/css/"]')).toBeNull();
    expect(document.querySelector('style[data-og-shell="css/error.css"]').textContent).toContain(
      'css/error.css'
    );
    const loading = result.indexOf('/* js/loading.js */');
    expect(loading).toBeGreaterThan(result.indexOf('<div id="app-error">'));
    expect(result.indexOf('/* js/bootstrap-analytics.js */')).toBeLessThan(loading);
    expect(loading).toBeLessThan(result.indexOf('/* js/bootstrap-resources.js */'));
    expect(document.querySelectorAll('#app-bootstrap-resources')).toHaveLength(1);
    expect(document.querySelector('title').textContent).toBe('Keep metadata');
    expect(document.querySelector('meta[name="description"]').content).toBe('Keep me');
    expect(rewriteBootstrapHtml(result, fixture(), sources)).toBe(result);
  });

  it('leaves static HTML untouched, including the landing stylesheet', () => {
    const staticHtml =
      '<head><link rel="stylesheet" href="/assets/main.css"></head><main>Landing</main>';
    expect(rewriteBootstrapHtml(staticHtml, fixture(), sources)).toBe(staticHtml);
  });

  it('runs after landing promotion so the shared stylesheet is retained', () => {
    const bundle = {
      ...fixture(),
      'index.html': { type: 'asset', source: html },
      'landing.html': {
        type: 'asset',
        source: '<head><!-- og-app-stylesheet --></head><main>Landing</main>',
      },
    };
    promoteStaticPages(
      bundle,
      file => {
        bundle[file.fileName] = file;
      },
      'html { color: black; }'
    );
    bundle['app.html'].source = rewriteBootstrapHtml(bundle['app.html'].source, bundle, sources);
    expect(bundle['index.html'].source).toContain('href="/assets/main.css"');
    expect(config(parse(bundle['app.html'].source)).resources).toContain('/assets/main.css');
  });

  it.each([
    'https://other.test/assets/main.js',
    '/assets/../main.js',
    '/assets/main.js?token=private',
  ])('rejects unsafe module URL %s', url => {
    expect(() =>
      rewriteBootstrapHtml(html.replace('/assets/main.js', url), fixture(), sources)
    ).toThrow(/asset|module/i);
  });

  it('accepts dotted chunk names emitted by Vite', () => {
    const bundle = fixture();
    bundle['assets/index.min-abc.js'] = chunk('assets/index.min-abc.js');
    bundle['assets/main.js'].imports.push('assets/index.min-abc.js');
    expect(config(parse(rewriteBootstrapHtml(html, bundle, sources))).resources).toContain(
      '/assets/index.min-abc.js'
    );
  });

  it('fails closed for missing static dependencies and ambiguous entries', () => {
    const bundle = fixture();
    delete bundle['assets/shared.js'];
    expect(() => rewriteBootstrapHtml(html, bundle, sources)).toThrow(/missing/i);
    bundle['assets/shared.js'] = chunk('assets/shared.js');
    bundle['assets/main.js'].imports = [];
    expect(() => rewriteBootstrapHtml(html, bundle, sources)).toThrow(/entry/i);
  });

  it('escapes inline closing tags without reading deployment environment', () => {
    const result = rewriteBootstrapHtml(html, fixture(), file =>
      file.endsWith('.css')
        ? '/* </style><script>bad()</script> */'
        : 'const example = "</script><script>bad()</script>";'
    );
    expect(
      [...parse(result).querySelectorAll('script')].some(node => node.textContent === 'bad()')
    ).toBe(false);
    expect(parse(result).querySelectorAll('script')).toHaveLength(4);
    expect(parse(result).querySelectorAll('#app-bootstrap-resources')).toHaveLength(1);
  });

  it('registers recovery after static landing in the actual build plugin list', () => {
    const configSource = readFileSync('vite.config.ts', 'utf8');
    expect(configSource.indexOf('bootstrapResources(),')).toBeGreaterThan(
      configSource.indexOf('staticPages(),')
    );
  });
});
