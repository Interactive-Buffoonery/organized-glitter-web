import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('public CI workflow', () => {
  it('does not deploy to Spacefast from the default CI pipeline', () => {
    expect(workflow).not.toContain('deploy-spacefast');
    expect(workflow).not.toContain('Publish to Spacefast live channel');
    expect(workflow).not.toContain('data.organizedglitter.app');
  });

  it('keeps reproducible public checks on standard runners', () => {
    expect(workflow).toContain('runs-on: ubuntu-24.04');
    expect(workflow).toContain('pnpm test:ci:static');
    expect(workflow).toContain('pnpm test:ci:unit');
  });
});
