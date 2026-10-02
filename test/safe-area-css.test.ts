import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const safeAreaCss = readFileSync(resolve(process.cwd(), 'public/css/safe-area.css'), 'utf8');

describe('safe-area CSS contract', () => {
  it('lets the sticky header own the top safe area with a zero fallback', () => {
    expect(safeAreaCss).toContain('.site-header-safe-area');
    expect(safeAreaCss).toContain('padding-top: env(safe-area-inset-top, 0px);');
  });

  it('keeps the app shell from double-applying top safe-area padding', () => {
    const mobileContainerRule = safeAreaCss.match(/\.mobile-app-container\s*\{[^}]*\}/)?.[0];

    expect(mobileContainerRule).toBeDefined();
    expect(mobileContainerRule).not.toContain('padding-top');
  });
});
