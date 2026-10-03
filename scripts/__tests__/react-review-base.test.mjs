import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { resolveReactReviewBase, BOOTSTRAP_REVIEW_BASE } from '../run-react-review.mjs';

describe('public React review baseline', () => {
  it('uses the requested normal base unchanged', () => {
    const gitFn = vi.fn(args => (args[0] === 'ls-tree' ? 'src\n' : ''));
    expect(resolveReactReviewBase('origin/main', gitFn)).toBe('origin/main');
  });
  it('uses the initial public extraction for the empty root only', () => {
    const gitFn = vi.fn(() => '');
    expect(resolveReactReviewBase('origin/main', gitFn)).toBe(BOOTSTRAP_REVIEW_BASE);
    expect(gitFn).toHaveBeenCalledWith([
      'merge-base',
      '--is-ancestor',
      BOOTSTRAP_REVIEW_BASE,
      'HEAD',
    ]);
  });
  it('does not treat deletion of an existing tree as a new bootstrap', () => {
    expect(resolveReactReviewBase('base', args => (args[0] === 'ls-tree' ? '' : 'parent'))).toBe(
      'base'
    );
  });
  it('fails closed when no comparison base is provided', () => {
    expect(() => resolveReactReviewBase('', vi.fn())).toThrow(/comparison base/i);
  });
  it('requires the shared CI command to receive an explicit base', () => {
    const { CI_BASE_REF: _baseRef, CI_BASE_SHA: _baseSha, ...env } = process.env;
    const result = spawnSync(process.execPath, ['scripts/run-react-review.mjs'], {
      encoding: 'utf8',
      env,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/explicit comparison base/i);
  });
});
