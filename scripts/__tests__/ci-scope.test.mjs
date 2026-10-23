import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { resolveComparison } from '../ci-scope.mjs';

describe('CI merge queue scope', () => {
  it('compares a merge group with the queue base it was built on', () => {
    expect(
      resolveComparison({
        eventName: 'merge_group',
        mergeGroupBaseSha: 'base',
        headSha: 'head',
      })
    ).toEqual({ base: 'base', head: 'head', range: 'base..head' });
  });

  it('runs a full selection for a merge group targeting main', () => {
    const result = spawnSync(process.execPath, ['scripts/ci-scope.mjs'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CI_EVENT_NAME: 'merge_group',
        CI_HEAD_SHA: 'HEAD',
        CI_MERGE_GROUP_BASE_SHA: 'HEAD^',
        CI_TARGET_BRANCH: 'refs/heads/main',
      },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ full: true });
  });
});
