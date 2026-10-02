import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ensureStartupScriptsBeforeAppModules,
  startupShellScriptsRunBeforeAppModules,
} from '../ensure-startup-script-order.mjs';

const readRepoFile = relativePath => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const previewBuiltIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <script>window.__OG_PUBLIC_ANALYTICS__={"key":"phc_test","host":"/glimmer"};</script>
    <script type="application/ld+json">{"@type":"WebApplication"}</script>
    <script type="module" crossorigin src="/assets/react-vendor-Cv25Oyj8.js"></script>
    <script type="module" crossorigin src="/assets/main-Dt9M8mEi.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/main-BfHxUIGE.css">
  </head>
  <body>
    <div id="root"></div>
    <div id="app-loading"></div>
    <script src="/js/bootstrap-analytics.js?v=1" defer></script>
    <script src="/js/loading.js?v=8" defer></script>
  </body>
</html>
`;

describe('ensureStartupScriptsBeforeAppModules', () => {
  it('moves loading.js ahead of Vite head modules so a ready app cannot miss app-loaded', () => {
    expect(startupShellScriptsRunBeforeAppModules(previewBuiltIndexHtml)).toBe(false);

    const ordered = ensureStartupScriptsBeforeAppModules(previewBuiltIndexHtml);

    expect(startupShellScriptsRunBeforeAppModules(ordered)).toBe(true);
    expect(ordered.indexOf('/js/loading.js')).toBeGreaterThan(-1);
    expect(ordered.indexOf('/js/loading.js')).toBeLessThan(
      ordered.indexOf('/assets/main-Dt9M8mEi.js')
    );
    expect(ordered.indexOf('/js/bootstrap-analytics.js')).toBeLessThan(
      ordered.indexOf('/js/loading.js')
    );
    expect(ordered).toContain('type="application/ld+json"');
    expect(ordered.match(/\/js\/loading\.js/g)).toHaveLength(1);
  });

  it('leaves already-correct source order unchanged', () => {
    const source = readRepoFile('index.html');
    expect(startupShellScriptsRunBeforeAppModules(source)).toBe(true);
    expect(ensureStartupScriptsBeforeAppModules(source)).toBe(source);
  });
});

describe('startup HTML script order', () => {
  it.each(['index.html', 'about.html'])(
    '%s keeps loading.js before the React module entry',
    file => {
      expect(startupShellScriptsRunBeforeAppModules(readRepoFile(file))).toBe(true);
    }
  );

  it('wires the reorder helper into the Vite HTML transform', () => {
    const viteConfig = readRepoFile('vite.config.ts');
    expect(viteConfig).toContain('ensureStartupScriptsBeforeAppModules');
    expect(viteConfig).toContain("order: 'post'");
  });
});
