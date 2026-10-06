import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { BROAD_CI_BASE } from '../ci-scope.mjs';
import { evaluateCiResult, requiredJobs } from '../ci-result.mjs';

const successfulJobs = () =>
  Object.fromEntries(requiredJobs.map(name => [name, { result: 'success' }]));

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
    expect(evaluateCiResult(successfulJobs()).every(job => job.passed)).toBe(true);
  });

  it.each(['failure', 'cancelled', 'skipped', undefined])(
    'rejects an incomplete required job: %s',
    result => {
      const jobs = successfulJobs();
      jobs['static-checks'] = { result };
      expect(evaluateCiResult(jobs).every(job => job.passed)).toBe(false);
    }
  );

  it('rejects missing required jobs', () => {
    const jobs = successfulJobs();
    delete jobs['unit-tests'];
    expect(evaluateCiResult(jobs).every(job => job.passed)).toBe(false);
  });

  it('keeps PocketBase and dependent browser runtime work off Actions', () => {
    const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8'));
    expect(workflow.jobs).not.toHaveProperty('backend');
    expect(workflow.jobs).not.toHaveProperty('browser');
    expect(requiredJobs).not.toContain('backend');
    expect(requiredJobs).not.toContain('browser');
  });

  it('does not ignore a failed dependency added to the workflow later', () => {
    const jobs = { ...successfulJobs(), 'additional-check': { result: 'failure' } };
    expect(evaluateCiResult(jobs).every(job => job.passed)).toBe(false);
  });

  it.each([{ needs: '' }, { needs: 'null' }, { needs: '[]' }, { needs: '{' }, { needs: '{}' }])(
    'fails closed for incomplete CLI input %#',
    ({ needs }) => {
      const result = spawnSync(process.execPath, ['scripts/ci-result.mjs'], {
        env: {
          ...process.env,
          CI_NEEDS: needs,
          GITHUB_STEP_SUMMARY: '',
        },
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
    }
  );
});
