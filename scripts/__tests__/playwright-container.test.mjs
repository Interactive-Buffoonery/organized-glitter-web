import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public CI workflows', () => {
  it('runs browser smoke on public runners without deployment credentials', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('qa:browser:ci');
    expect(workflow).not.toContain('playwright-image');
    expect(workflow).toContain('react-doctor');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toContain('self-hosted');
  });
});
