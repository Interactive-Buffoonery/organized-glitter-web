import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';

import {
  BROAD_CI_BASE,
  classifyCiScope,
  resolveComparison,
  resolveGitCommit,
} from '../ci-scope.mjs';

describe('CI comparison baseline', () => {
  it('uses the pull request base SHA with a merge-base comparison', () => {
    expect(
      resolveComparison({
        eventName: 'pull_request',
        pullRequestBaseSha: 'base',
        headSha: 'head',
      })
    ).toEqual({ base: 'base', head: 'head', range: 'base...head' });
  });

  it('uses the before SHA for a push comparison', () => {
    expect(
      resolveComparison({
        eventName: 'push',
        pushBeforeSha: 'before',
        headSha: 'head',
      })
    ).toEqual({ base: 'before', head: 'head', range: 'before..head' });
  });

  it.each(['schedule', 'workflow_dispatch'])(
    'requires an explicit baseline for %s runs',
    eventName => {
      expect(() => resolveComparison({ eventName, headSha: 'head' })).toThrow(
        /explicit comparison baseline/i
      );
      expect(resolveComparison({ eventName, explicitBase: 'head^', headSha: 'head' })).toEqual({
        base: 'head^',
        head: 'head',
        range: 'head^..head',
      });
    }
  );

  it('uses the populated baseline and forces a full run for a new branch', () => {
    expect(
      resolveComparison({
        eventName: 'push',
        pushBeforeSha: '0'.repeat(40),
        branchCreationBase: BROAD_CI_BASE,
        headSha: 'head',
      })
    ).toEqual({
      base: BROAD_CI_BASE,
      branchCreation: true,
      head: 'head',
      range: `${BROAD_CI_BASE}..head`,
    });
  });

  it('fails closed when a new branch has no populated baseline policy', () => {
    expect(() =>
      resolveComparison({
        eventName: 'push',
        pushBeforeSha: '0'.repeat(40),
        headSha: 'head',
      })
    ).toThrow(/branch creation baseline/i);
  });

  it('fetches an exact missing push commit before resolving it', () => {
    const gitFn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('missing');
      })
      .mockReturnValueOnce('')
      .mockReturnValueOnce('resolved-before\n');

    expect(resolveGitCommit('before', { fetchMissing: true, gitFn })).toBe('resolved-before');
    expect(gitFn).toHaveBeenNthCalledWith(2, [
      'fetch',
      '--no-tags',
      '--depth=1',
      'origin',
      'before',
    ]);
  });

  it('does not replace an unreachable push commit when the exact fetch fails', () => {
    const gitFn = vi.fn(() => {
      throw new Error('missing');
    });

    expect(() => resolveGitCommit('before', { fetchMissing: true, gitFn })).toThrow('missing');
  });

  it('runs the real Git comparison for a pull request range', () => {
    const result = spawnSync(process.execPath, ['scripts/ci-scope.mjs'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_EVENT_NAME: 'pull_request',
        CI_HEAD_SHA: 'HEAD',
        CI_PULL_REQUEST_BASE_SHA: BROAD_CI_BASE,
        CI_TARGET_BRANCH: 'dev',
      },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ base: BROAD_CI_BASE });
  });

  it('runs the real Git branch-creation policy as a full selection', () => {
    const result = spawnSync(process.execPath, ['scripts/ci-scope.mjs'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_BRANCH_CREATION_BASE: BROAD_CI_BASE,
        CI_EVENT_NAME: 'push',
        CI_HEAD_SHA: 'HEAD',
        CI_PUSH_BEFORE_SHA: '0'.repeat(40),
        CI_TARGET_BRANCH: 'dev',
      },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      backend: true,
      base: BROAD_CI_BASE,
      browser: true,
      full: true,
    });
  });
});

describe('CI execution scope', () => {
  it('skips backend and browser only for ordinary documentation', () => {
    expect(classifyCiScope(['README.md', 'docs/agents/ci.md'])).toEqual({
      backend: false,
      browser: false,
      full: false,
      reason: 'ordinary documentation only',
    });
  });

  it.each([
    'pnpm-lock.yaml',
    '.github/workflows/ci.yml',
    'scripts/ci-scope.mjs',
    'src/components/auth/SocialLogin.tsx',
    'src/contexts/AuthContext/AuthContext.tsx',
    'src/services/auth-analytics.ts',
    'src/components/Library.test.tsx',
    'src/main.tsx',
    'src/App.tsx',
    'src/components/layout/AppProviders.tsx',
    'src/components/routing/AppRoutes.tsx',
    'src/pages/NewProjectRouter.tsx',
    'src/utils/safe-env.ts',
    'src/lib/pocketbaseConfig.ts',
    'playwright.config.ts',
    'vitest.config.ts',
  ])('selects both expensive jobs for shared or sensitive changes: %s', filePath => {
    expect(classifyCiScope([filePath])).toMatchObject({ backend: true, browser: true });
  });

  it('selects browser validation for a narrow frontend change', () => {
    expect(classifyCiScope(['src/components/Library.tsx'])).toEqual({
      backend: false,
      browser: true,
      full: false,
      reason: 'browser-facing changes',
    });
  });

  it('selects backend and browser validation for PocketBase changes', () => {
    expect(classifyCiScope(['pb_migrations/1800000000_forward.js'])).toEqual({
      backend: true,
      browser: true,
      full: false,
      reason: 'backend or shared changes',
    });
  });

  it('defaults unknown paths to both expensive jobs', () => {
    expect(classifyCiScope(['unclassified/input.data'])).toMatchObject({
      backend: true,
      browser: true,
    });
  });

  it.each([
    { eventName: 'schedule', targetBranch: 'main' },
    { eventName: 'workflow_dispatch', targetBranch: 'feature' },
    { eventName: 'pull_request', targetBranch: 'main' },
    { eventName: 'push', targetBranch: 'main' },
  ])('selects the full suite for release, scheduled, and manual runs: %#', context => {
    expect(classifyCiScope(['README.md'], context)).toMatchObject({
      backend: true,
      browser: true,
      full: true,
    });
  });

  it('selects the full suite for a new branch push', () => {
    expect(classifyCiScope(['README.md'], { comparison: { branchCreation: true } })).toMatchObject({
      backend: true,
      browser: true,
      full: true,
    });
  });

  it('reads changed paths from the event-specific range', () => {
    const gitFn = vi.fn(() => 'README.md\0docs/agents/ci.md\0');
    const comparison = resolveComparison({
      eventName: 'pull_request',
      pullRequestBaseSha: 'base',
      headSha: 'head',
    });

    expect(classifyCiScope(undefined, { comparison, gitFn })).toMatchObject({
      backend: false,
      browser: false,
    });
    expect(gitFn).toHaveBeenCalledWith([
      'diff',
      '--name-only',
      '--no-renames',
      '-z',
      'base...head',
    ]);
  });
});
