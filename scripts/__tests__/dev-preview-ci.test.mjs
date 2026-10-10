import { describe, expect, it } from 'vitest';
import { selectDevCIRun } from '../dev-preview-ci.mjs';

const sha = 'a'.repeat(40);
const run = {
  id: 42,
  head_sha: sha,
  head_branch: 'dev',
  event: 'push',
  path: '.github/workflows/ci.yml',
  repository: { full_name: 'Interactive-Buffoonery/organized-glitter-web' },
  head_repository: { full_name: 'Interactive-Buffoonery/organized-glitter-web' },
};

describe('dev preview CI selection', () => {
  it('selects the newest push CI run for the exact dev commit', () => {
    expect(selectDevCIRun([run, { ...run, id: 43 }], sha)).toBe(43);
    expect(selectDevCIRun([], sha)).toBeNull();
  });

  it('rejects other commits, branches, workflows, events, and repositories', () => {
    for (const change of [
      { head_sha: 'b'.repeat(40) },
      { head_branch: 'main' },
      { path: '.github/workflows/other.yml' },
      { event: 'pull_request' },
      { repository: { full_name: 'other/repo' } },
      { head_repository: { full_name: 'other/repo' } },
      { id: '42' },
    ]) {
      expect(selectDevCIRun([{ ...run, ...change }], sha)).toBeNull();
    }
  });
});
