import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { requiredJobs } from '../ci-result.mjs';
import {
  buildPhasePlan,
  ciJobForPhase,
  phaseOutcome,
  parseArgs,
  formatValidationReport,
} from '../run-local-validation.mjs';

describe('local validation orchestrator', () => {
  it('partitions all CI phases exactly once and rejects invalid selectors', () => {
    const phases = buildPhasePlan('ci').map(([name]) => name);
    expect(phases.flatMap(phase => buildPhasePlan('ci', phase))).toEqual(buildPhasePlan('ci'));
    expect(() => buildPhasePlan('ci', 'static')).toThrow();
    expect(() => parseArgs(['--profile=pr', '--base=origin/dev', '--phase=backend'])).toThrow();
    expect(() => parseArgs(['--profile=ci', '--base=origin/dev', '--phase=typo'])).toThrow();
    expect(parseArgs(['--profile=ci', '--base=origin/dev', '--phase=backend']).phase).toBe(
      'backend'
    );
    expect(phaseOutcome('backend', 'ci', 'backend')).toBe('not-run');
    expect(phaseOutcome('built-app', 'ci', 'backend')).toBe('delegated-to-ci-phase-built-app');
    expect(phaseOutcome('static', 'ci', 'backend')).toBe('delegated-to-static-checks');
  });

  it('runs every CI phase in an isolated job and fails closed on the matrix result', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    for (const [phase] of buildPhasePlan('ci')) expect(workflow).toContain(`- ${phase}`);
    expect(workflow).toContain('fail-fast: false');
    expect(workflow).toContain('run: pnpm test:pr:ci --phase=${{ matrix.phase }}');
    expect(workflow).toContain('needs: [scope, validation-phase]');
    expect(workflow).toContain('VALIDATION_RESULT: ${{ needs.validation-phase.result }}');
    expect(workflow).toContain('test "$VALIDATION_RESULT" = success');
  });

  it('rejects every incomplete matrix outcome at the required gate', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/ci.yml', import.meta.url),
      'utf8'
    );
    const gate = workflow.split('  complete-pr:')[1].split('  result:')[0];
    const command = gate.match(/run: (.+)/)[1];
    for (const scope of ['success', 'failure', 'cancelled', 'skipped', '']) {
      for (const matrix of ['success', 'failure', 'cancelled', 'skipped', '']) {
        const result = spawnSync('sh', ['-c', command], {
          env: { SCOPE_RESULT: scope, VALIDATION_RESULT: matrix },
        });
        expect(result.status === 0).toBe(scope === 'success' && matrix === 'success');
      }
    }
  });

  it('delegates built-app browser suites from cloud to complete PR validation', () => {
    const builtApp = ['built-app', 'test:built-app'];
    expect(buildPhasePlan('pr')).toContainEqual(builtApp);
    expect(buildPhasePlan('release')).toContainEqual(builtApp);
    expect(buildPhasePlan('ci')).toContainEqual(builtApp);
    expect(buildPhasePlan('cloud')).not.toContainEqual(builtApp);
    const config = readFileSync(
      new URL('../../playwright.built-app.config.ts', import.meta.url),
      'utf8'
    );
    for (const spec of ['cold-load', 'not-found', 'pwa-navigation']) {
      expect(config).toContain(`testMatch: '${spec}.spec.ts'`);
    }
  });

  it('cloud checks retain every non-browser PR phase and delegate every browser phase', () => {
    const pr = buildPhasePlan('pr');
    const cloud = buildPhasePlan('cloud');
    const browserPhases = ['built-app', 'browser-smoke', 'protected-file-browser', 'blog-browser'];
    expect(cloud).toEqual(pr.filter(([name]) => !browserPhases.includes(name)));
    const report = formatValidationReport({
      profile: 'cloud',
      outcome: 'cloud-checks-passed',
      platform: { operatingSystem: 'linux', architecture: 'x64' },
      repository: { base: { sha: 'abc' }, head: { commit: 'def' } },
      phases: pr.map(([name]) => ({
        name,
        outcome: browserPhases.includes(name) ? 'delegated-to-ci' : 'passed',
      })),
    });
    for (const name of browserPhases) expect(report).toContain(`| ${name} | delegated-to-ci |`);
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
    expect(workflow).toContain('run: pnpm test:pr:ci --phase=${{ matrix.phase }}');
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
    for (const job of [...jobs, 'validation-phase']) {
      const block = workflow.split(`\n  ${job}:\n`)[1]?.split(/\n  [a-z-]+:\n/)[0];
      expect(block, job).toContain(headRef);
    }
  });
});
