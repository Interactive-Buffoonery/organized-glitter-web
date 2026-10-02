import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));

describe('build scripts', () => {
  it('provide a local-build default for VITE_APP_VERSION', () => {
    const buildScript = packageJson.scripts.build;
    const buildWithSitemap = packageJson.scripts['build:with-sitemap'];

    // Should set a default when VITE_APP_VERSION is not already defined
    expect(buildScript).toMatch(/VITE_APP_VERSION=\$\{VITE_APP_VERSION:-local-build\}/);
    expect(buildWithSitemap).toMatch(/VITE_APP_VERSION=\$\{VITE_APP_VERSION:-local-build\}/);
  });
});
