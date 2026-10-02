import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public CI workflows', () => {
  it('does not run Playwright browser smoke in the default CI workflow', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).not.toContain('qa:browser');
    expect(workflow).not.toContain('playwright-image');
    expect(workflow).not.toContain('react-doctor');
  });
});
