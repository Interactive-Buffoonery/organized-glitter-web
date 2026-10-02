import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { evaluateCiResult, requiredJobs } from '../ci-result.mjs';

const successfulJobs = () =>
  Object.fromEntries(requiredJobs.map(name => [name, { result: 'success' }]));

describe('authoritative CI result', () => {
  it('passes only when every required job completed successfully', () => {
    expect(evaluateCiResult(successfulJobs()).every(job => job.passed)).toBe(true);
  });

  it.each(['failure', 'cancelled', 'skipped', undefined])(
    'rejects an expected build job with result %s',
    result => {
      const jobs = successfulJobs();
      jobs.build = { result };
      expect(evaluateCiResult(jobs).find(job => job.name === 'build').passed).toBe(false);
    }
  );

  it('rejects absent jobs even when every supplied result passed', () => {
    const jobs = successfulJobs();
    delete jobs.backend;
    expect(evaluateCiResult(jobs).every(job => job.passed)).toBe(false);
  });

  it('does not ignore a failed dependency added to the workflow later', () => {
    const jobs = { ...successfulJobs(), 'additional-check': { result: 'failure' } };
    expect(evaluateCiResult(jobs).every(job => job.passed)).toBe(false);
  });

  it.each(['', 'null', '[]', '{', '{}'])('fails closed for incomplete CLI input %s', input => {
    const result = spawnSync(process.execPath, ['scripts/ci-result.mjs'], {
      env: { ...process.env, CI_NEEDS: input, GITHUB_STEP_SUMMARY: '' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
  });
});
