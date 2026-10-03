import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { BROAD_CI_BASE } from '../ci-scope.mjs';
import { evaluateCiResult, requiredJobs } from '../ci-result.mjs';

const successfulJobs = () =>
  Object.fromEntries(requiredJobs.map(name => [name, { result: 'success' }]));
const fullPlan = () => ({ backend: true, browser: true });

describe('authoritative CI result', () => {
  it('matches every dependency wired into the workflow result job', () => {
    const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
    expect(new Set(workflow.jobs.result.needs)).toEqual(new Set(requiredJobs));
    const scopeEnvironment = workflow.jobs.scope.steps.find(step => step.id === 'scope').env;
    expect(scopeEnvironment.CI_BRANCH_CREATION_BASE).toBe(BROAD_CI_BASE);
    expect(scopeEnvironment.CI_EXPLICIT_BASE).toContain(BROAD_CI_BASE);
    expect(workflow.on.workflow_dispatch.inputs.comparison_base).toMatchObject({
      required: false,
      type: 'string',
    });
  });

  it('passes only when every required job completed successfully', () => {
    expect(evaluateCiResult(successfulJobs(), fullPlan()).every(job => job.passed)).toBe(true);
  });

  it.each(['failure', 'cancelled', 'skipped', undefined])(
    'rejects a selected backend job with result %s',
    result => {
      const jobs = successfulJobs();
      jobs.backend = { result };
      expect(evaluateCiResult(jobs, fullPlan()).find(job => job.name === 'backend').passed).toBe(
        false
      );
    }
  );

  it('rejects absent jobs even when every supplied result passed', () => {
    const jobs = successfulJobs();
    delete jobs.backend;
    expect(evaluateCiResult(jobs, fullPlan()).every(job => job.passed)).toBe(false);
  });

  it('accepts skipped expensive jobs only when the plan did not select them', () => {
    const jobs = successfulJobs();
    jobs.backend = { result: 'skipped' };
    jobs.browser = { result: 'skipped' };

    const results = evaluateCiResult(jobs, { backend: false, browser: false });

    expect(results.find(job => job.name === 'backend')).toMatchObject({
      passed: true,
      selected: false,
    });
    expect(results.find(job => job.name === 'browser')).toMatchObject({
      passed: true,
      selected: false,
    });
  });

  it('rejects a job that ran despite being unselected', () => {
    const jobs = successfulJobs();
    jobs.backend = { result: 'success' };
    jobs.browser = { result: 'skipped' };

    expect(
      evaluateCiResult(jobs, { backend: false, browser: false }).find(job => job.name === 'backend')
        .passed
    ).toBe(false);
  });

  it('rejects an incomplete execution plan', () => {
    expect(() => evaluateCiResult(successfulJobs(), { backend: true })).toThrow(/execution plan/i);
  });

  it('does not ignore a failed dependency added to the workflow later', () => {
    const jobs = { ...successfulJobs(), 'additional-check': { result: 'failure' } };
    expect(evaluateCiResult(jobs, fullPlan()).every(job => job.passed)).toBe(false);
  });

  it.each([
    { needs: '', plan: JSON.stringify(fullPlan()) },
    { needs: 'null', plan: JSON.stringify(fullPlan()) },
    { needs: '[]', plan: JSON.stringify(fullPlan()) },
    { needs: '{', plan: JSON.stringify(fullPlan()) },
    { needs: '{}', plan: JSON.stringify(fullPlan()) },
    { needs: JSON.stringify(successfulJobs()), plan: '' },
    { needs: JSON.stringify(successfulJobs()), plan: '{}' },
  ])('fails closed for incomplete CLI input %#', ({ needs, plan }) => {
    const result = spawnSync(process.execPath, ['scripts/ci-result.mjs'], {
      env: {
        ...process.env,
        CI_NEEDS: needs,
        CI_PLAN: plan,
        GITHUB_STEP_SUMMARY: '',
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
  });
});
