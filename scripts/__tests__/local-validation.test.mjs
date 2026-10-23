import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { requiredJobs } from '../ci-result.mjs';
import {
  buildPhasePlan,
  ciJobForPhase,
  parseArgs,
  formatValidationReport,
} from '../run-local-validation.mjs';

describe('local validation orchestrator', () => {
  it('cloud checks retain every non-browser PR phase and delegate every browser phase', () => {
    const pr = buildPhasePlan('pr');
    const cloud = buildPhasePlan('cloud');
    expect(cloud).toEqual(pr.slice(0, 6));
    const report = formatValidationReport({
      profile: 'cloud',
      outcome: 'cloud-checks-passed',
      platform: { operatingSystem: 'linux', architecture: 'x64' },
      repository: { base: { sha: 'abc' }, head: { commit: 'def' } },
      phases: pr.map(([name], index) => ({
        name,
        outcome: index < 6 ? 'passed' : 'delegated-to-ci',
      })),
    });
    for (const [name] of pr.slice(6)) expect(report).toContain(`| ${name} | delegated-to-ci |`);
    expect(report).toContain('Browser coverage: delegated to CI, not passed locally.');
    expect(report).toContain('Complete PR validation: not established by this cloud profile.');
    expect(parseArgs(['--profile=cloud', '--base=origin/dev']).profile).toBe('cloud');
  });

  it('ci profile keeps PR phase order and hands every other phase to a required CI job', () => {
    const pr = buildPhasePlan('pr');
    const ci = buildPhasePlan('ci');
    expect(ci).toEqual(pr.filter(([name]) => !ciJobForPhase(name)));
    expect(ci.map(([name]) => name)).toEqual([
      'backend',
      'built-app',
      'browser-smoke',
      'protected-file-browser',
      'blog-browser',
    ]);
    for (const [name] of pr.filter(([name]) => ciJobForPhase(name))) {
      expect(requiredJobs).toContain(ciJobForPhase(name));
    }
    expect(parseArgs(['--profile=ci', '--base=origin/dev']).profile).toBe('ci');
  });

  it('ci profile reports delegated phases and their sibling job', () => {
    const report = formatValidationReport({
      profile: 'ci',
      outcome: 'failed',
      failure: 'browser-smoke exited 1.',
      platform: { operatingSystem: 'linux', architecture: 'x64' },
      repository: { base: { sha: 'abc' }, head: { commit: 'def' } },
      phases: buildPhasePlan('pr').map(([name]) => ({
        name,
        outcome: ciJobForPhase(name) ? `delegated-to-${ciJobForPhase(name)}` : 'not-run',
      })),
    });
    expect(report).toContain('| static | delegated-to-static-checks |');
    expect(report).toContain('| unit | delegated-to-unit-tests |');
    expect(report).toContain('| react | delegated-to-react-doctor |');
    expect(report).toContain('| build | delegated-to-publication-security |');
    expect(report).toContain('| publication | delegated-to-publication-security |');
    expect(report).toContain('Failure: browser-smoke exited 1.');
    expect(report).toContain(
      'Static, unit, React, build, and publication: run by sibling CI jobs.'
    );
  });

  it('complete PR CI job runs the ci profile and the result job requires every sibling', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    expect(workflow).toContain('run: pnpm test:pr:ci');
    expect(workflow).toContain('.tmp/local-validation/*-ci/report.md');
    expect(workflow).toMatch(
      /needs: \[scope, static-checks, unit-tests, react-doctor, publication-security, complete-pr\]/
    );
  });

  it('delegated CI jobs check out the same PR head commit as complete PR validation', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    const headRef = 'ref: ${{ github.event.pull_request.head.sha || github.sha }}';
    const jobs = new Set(
      buildPhasePlan('pr')
        .map(([name]) => ciJobForPhase(name))
        .filter(Boolean)
    );
    for (const job of [...jobs, 'complete-pr']) {
      const block = workflow.split(`\n  ${job}:\n`)[1]?.split(/\n  [a-z-]+:\n/)[0];
      expect(block, job).toContain(headRef);
    }
  });
});
