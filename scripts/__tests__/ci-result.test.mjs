import { describe, expect, it } from 'vitest';
import { evaluateCiResult, requiredJobs } from '../ci-result.mjs';

const successfulJobs = () =>
  Object.fromEntries(requiredJobs.map(name => [name, { result: 'success' }]));

describe('authoritative CI result', () => {
  it('does not ignore a failed dependency added to the workflow later', () => {
    const jobs = { ...successfulJobs(), 'additional-check': { result: 'failure' } };
    expect(evaluateCiResult(jobs).every(job => job.passed)).toBe(false);
  });
});
