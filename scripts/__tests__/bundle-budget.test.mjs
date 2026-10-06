import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { measureBuild, checkBudgets } from '../bundle-budget.mjs';

function fixture({
  sw = '[{url:"index.html",revision:"a"},{url:"assets/main.js",revision:null}]',
} = {}) {
  const dist = mkdtempSync(path.join(tmpdir(), 'og-bundle-budget-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<main>Static landing</main>');
  writeFileSync(
    path.join(dist, 'app.html'),
    '<script src="/js/start.js?v=1"></script><script type="module" src="/assets/main.js"></script><script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">'
  );
  mkdirSync(path.join(dist, 'js'));
  writeFileSync(path.join(dist, 'js/start.js'), 'start();');
  writeFileSync(path.join(dist, 'assets/main.js'), 'import "./shared.js";');
  writeFileSync(path.join(dist, 'assets/shared.js'), 'shared();');
  writeFileSync(path.join(dist, 'assets/lazy.js'), 'lazy();');
  writeFileSync(path.join(dist, 'assets/main.css'), 'body{}');
  writeFileSync(path.join(dist, 'sw.js'), `function(s){L().precache(s)}(${sw}),next();`);
  writeFileSync(
    path.join(dist, 'manifest.json'),
    JSON.stringify({
      main: {
        file: 'assets/main.js',
        imports: ['shared'],
        dynamicImports: ['lazy'],
        css: ['assets/main.css'],
      },
      shared: { file: 'assets/shared.js' },
      lazy: { file: 'assets/lazy.js' },
    })
  );
  return dist;
}

describe('bundle budget measurement', () => {
  it('counts each eager entry and static import once, excluding lazy imports', () => {
    const report = measureBuild(fixture());
    expect(report.shell.files.map(file => file.path).sort()).toEqual([
      'assets/main.css',
      'assets/main.js',
      'assets/shared.js',
      'js/start.js',
    ]);
    expect(report.precache.files.map(file => file.path)).toEqual(['index.html', 'assets/main.js']);
    expect(report.precache.rawBytes).toBeGreaterThan(0);
  });

  it('fails closed when the generated Workbox list is absent', () => {
    expect(() => measureBuild(fixture({ sw: '[]' }))).toThrow(/precache/i);
  });

  it('counts a duplicate precache URL only once for transfer', () => {
    const report = measureBuild(
      fixture({ sw: '[{url:"index.html",revision:"a"},{url:"index.html",revision:"a"}]' })
    );
    expect(report.precache.manifestEntries).toBe(2);
    expect(report.precache.files).toHaveLength(1);
  });

  it('fails when a referenced asset is missing', () => {
    const dist = fixture({ sw: '[{url:"missing.js",revision:null}]' });
    expect(() => measureBuild(dist)).toThrow(/missing.js/);
  });

  it.each(['..', 'assets/..', 'assets/../..', '../outside.js', '../dist-sibling/file.js'])(
    'rejects precache path %s outside a build asset',
    url => {
      const dist = fixture({ sw: `[{url:"${url}",revision:null}]` });
      expect(() => measureBuild(dist)).toThrow(`Invalid build asset path: ${url}`);
    }
  );

  it('rejects a precache directory as an asset', () => {
    const dist = fixture({ sw: '[{url:"assets",revision:null}]' });
    expect(() => measureBuild(dist)).toThrow('Invalid build asset path: assets');
  });

  it('rejects a symlinked precache asset outside dist', () => {
    const dist = fixture({ sw: '[{url:"outside.js",revision:null}]' });
    const outside = path.join(mkdtempSync(path.join(tmpdir(), 'og-outside-')), 'outside.js');
    writeFileSync(outside, 'outside();');
    symlinkSync(outside, path.join(dist, 'outside.js'));
    expect(() => measureBuild(dist)).toThrow('Invalid build asset path: outside.js');
  });

  it('checks both measured dimensions against a baseline headroom', () => {
    const report = measureBuild(fixture());
    const baseline = {
      shellGzipBytes: report.shell.gzipBytes - 10,
      precacheRawBytes: report.precache.rawBytes - 10,
      allowedGrowthPercent: 0,
    };
    expect(checkBudgets(report, baseline)).toEqual(
      expect.arrayContaining([expect.stringMatching(/shell/i), expect.stringMatching(/precache/i)])
    );
    expect(checkBudgets(report, { ...baseline, allowedGrowthPercent: 100 })).toEqual([]);
  });
});
