import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public CI workflows', () => {
  it('keeps runtime suites local and hosted checks credential-free', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).not.toContain('qa:browser');
    expect(workflow).not.toContain('test:ci:backend');
    const runner = readFileSync('scripts/run-local-validation.mjs', 'utf8');
    expect(runner).toContain('qa:browser');
    expect(runner).toContain('test:ci:backend');
    expect(workflow).not.toContain('playwright-image');
    expect(workflow).toContain('react-doctor');
    expect(workflow).not.toContain('secrets.');
    expect(workflow).not.toContain('self-hosted');
  });
});
