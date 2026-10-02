import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
const mobileAppContainerRule = indexCss.match(/\.mobile-app-container\s*\{[^}]*\}/)?.[0];
const rootRule = indexCss.match(/:root\s*\{[^}]*--bottom-nav-content-height[^}]*\}/)?.[0];

describe('app shell CSS contract', () => {
  it('keeps the app shell on normal document scrolling', () => {
    expect(mobileAppContainerRule).toBeDefined();
    expect(mobileAppContainerRule).toContain('min-height: 100vh');
    expect(mobileAppContainerRule).toContain('min-height: 100dvh');
    expect(mobileAppContainerRule).toContain('overflow-x: hidden');
    expect(mobileAppContainerRule).not.toMatch(/(^|\n)\s*height:\s*100(?:d)?vh/);
    expect(mobileAppContainerRule).not.toContain('overflow-y: auto');
  });

  it('keeps mobile bottom chrome height in one shared CSS contract', () => {
    expect(rootRule).toBeDefined();
    expect(rootRule).toContain('--bottom-nav-content-height: 4rem');
    expect(rootRule).toContain('--bottom-nav-safe-area: env(safe-area-inset-bottom, 0px)');
    expect(rootRule).toContain('--bottom-nav-total-height: calc(');
  });
});
