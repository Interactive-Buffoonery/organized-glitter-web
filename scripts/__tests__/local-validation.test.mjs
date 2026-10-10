import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildPhasePlan,
  dirtyIdentity,
  environmentForPhase,
  localBuildEnvironmentFilesDigest,
  parseArgs,
  publicBuildEnvironmentDigest,
  recordPhaseFailure,
  formatValidationReport,
  validationEnvironment,
} from '../run-local-validation.mjs';

describe('local validation orchestrator', () => {
  it('writes a failed run report before exiting when the base cannot resolve', () => {
    const result = spawnSync(
      process.execPath,
      [
        new URL('../run-local-validation.mjs', import.meta.url).pathname,
        '--profile=backend',
        '--base=refs/heads/missing-validation-regression-base',
      ],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(1);
    const summaryPath = result.stdout.match(/Local validation summary: (.+)/)?.[1];
    const reportPath = result.stdout.match(/Local validation report: (.+)/)?.[1];
    expect(summaryPath).toBeDefined();
    expect(reportPath).toBeDefined();
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary.outcome).toBe('failed');
    expect(summary.phases).toEqual([]);
    expect(summary.finishedAt).toBeDefined();
    expect(summary.repository.base.ref).toBe('refs/heads/missing-validation-regression-base');
    const report = readFileSync(reportPath, 'utf8');
    expect(report).toContain('Result: failed');
    expect(report).toContain('Could not initialize repository identity');
    expect(report).not.toContain('undefined');
  });
  it('runs PocketBase first and preserves every existing PR gate', () => {
    expect(buildPhasePlan('pr')).toEqual([
      ['backend', 'test:ci:backend'],
      ['static', 'test:ci:static'],
      ['unit', 'test:ci:unit'],
      ['react', 'test:ci:react'],
      ['build', 'test:ci:build'],
      ['publication', 'test:publication'],
      ['not-found', 'test:not-found'],
      ['pwa-navigation', 'test:pwa:navigation'],
      ['cold-load', 'test:cold-load'],
      ['browser-smoke', 'qa:browser'],
      ['protected-file-browser', 'test:protected-file-rotation-browser'],
      ['blog-browser', 'qa:blog'],
    ]);
  });

  it('runs cold-load through the dedicated built-artifact config', () => {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
    expect(scripts['test:cold-load']).toBe(
      'playwright test --config playwright.cold-load.config.ts'
    );
  });

  it('can run and report only the local PocketBase gate', () => {
    expect(buildPhasePlan('backend')).toEqual([['backend', 'test:ci:backend']]);
    const report = formatValidationReport({
      outcome: 'failed',
      repository: { head: { commit: 'abc123' }, base: { sha: 'def456' } },
      platform: { operatingSystem: 'darwin', architecture: 'arm64' },
      phases: [{ name: 'backend', outcome: 'failed', durationMs: 1000, exitCode: 1 }],
    });
    expect(report).toContain('PocketBase');
    expect(report).toContain('darwin/arm64');
    expect(report).toContain('failed');
    expect(report).toContain('abc123');
  });

  it('uses the broader browser inventory for a release gate', () => {
    const release = buildPhasePlan('release');

    expect(release).toContainEqual(['browser-full', 'qa:browser:full']);
    expect(release).toContainEqual(['cold-load', 'test:cold-load']);
    expect(release).not.toContainEqual(['browser-smoke', 'qa:browser']);
  });

  it('requires an explicit base and known profile', () => {
    expect(parseArgs(['--profile=pr', '--base=origin/example'])).toEqual({
      base: 'origin/example',
      profile: 'pr',
    });
    expect(() => parseArgs(['--profile=pr'])).toThrow(/--base/);
    expect(() => parseArgs(['--profile=unknown', '--base=origin/example'])).toThrow(
      /Unknown validation profile/
    );
  });

  it('preserves safe caller inputs and passes the resolved base to general phases', () => {
    expect(
      validationEnvironment('abc123', {
        APP_TEST_ENV: 'caller-setting',
        EXISTING: 'value',
        SERVICE_TOKEN: 'do-not-forward',
        VITE_APP_URL: 'http://localhost:4173',
      })
    ).toEqual({
      APP_TEST_ENV: 'caller-setting',
      CI_BASE_REF: 'abc123',
      CI_BASE_SHA: 'abc123',
      EXISTING: 'value',
      VITE_APP_URL: 'http://localhost:4173',
    });
  });

  it('does not assign public build defaults to a general phase', () => {
    const environment = environmentForPhase('unit', 'abc123', { PATH: '/bin' }, 'def456');

    expect(environment).toEqual({
      CI_BASE_REF: 'abc123',
      CI_BASE_SHA: 'abc123',
      PATH: '/bin',
    });
    expect(environment).not.toHaveProperty('APP_TEST_ENV');
    expect(environment).not.toHaveProperty('VITE_APP_URL');
    expect(environment).not.toHaveProperty('VITE_APP_VERSION');
    expect(environment).not.toHaveProperty('VITE_POCKETBASE_URL');
  });

  it('assigns deterministic public local configuration only to the build phase', () => {
    expect(
      environmentForPhase(
        'build',
        'abc123',
        {
          EXISTING: 'value',
          GH_TOKEN: 'do-not-forward',
          PATH: '/bin',
        },
        'def4567890abc'
      )
    ).toEqual({
      APP_TEST_ENV: 'test',
      CI_BASE_REF: 'abc123',
      CI_BASE_SHA: 'abc123',
      EXISTING: 'value',
      PATH: '/bin',
      VITE_APP_URL: 'http://127.0.0.1:3000',
      VITE_APP_VERSION: 'local-validation-def4567890ab',
      VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
    });
  });

  it('changes dirty identity when an untracked source file changes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-local-validation-'));
    const git = (...args) => execFileSync('git', args, { cwd: directory });
    git('init', '-q');
    git('config', 'user.email', 'test@example.test');
    git('config', 'user.name', 'Test');
    writeFileSync(path.join(directory, 'tracked.txt'), 'tracked');
    git('add', 'tracked.txt');
    git('commit', '-qm', 'add tracked file');
    writeFileSync(path.join(directory, 'new-source.mjs'), 'first');
    const first = dirtyIdentity(directory);
    writeFileSync(path.join(directory, 'new-source.mjs'), 'second');
    const second = dirtyIdentity(directory);

    expect(first.dirty).toBe(true);
    expect(second.digest).not.toBe(first.digest);
  });

  it('identifies effective public build inputs without recording their values', () => {
    const first = publicBuildEnvironmentDigest({
      APP_TEST_ENV: 'test',
      VITE_APP_URL: 'http://127.0.0.1:3000',
    });
    const second = publicBuildEnvironmentDigest({
      APP_TEST_ENV: 'test',
      VITE_APP_URL: 'http://127.0.0.1:4000',
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it('changes build identity when an ignored Vite environment file changes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-build-environment-'));
    writeFileSync(path.join(directory, '.env.local'), 'VITE_APP_URL=http://first.example.test\n');
    const first = localBuildEnvironmentFilesDigest(directory);
    writeFileSync(path.join(directory, '.env.local'), 'VITE_APP_URL=http://second.example.test\n');
    const second = localBuildEnvironmentFilesDigest(directory);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it('records a child launch error without serializing its message or environment', () => {
    const phase = { name: 'static', outcome: 'running' };
    const error = Object.assign(
      new Error('could not spawn with env {"SERVICE_TOKEN":"top-secret"}'),
      { code: 'ENOENT' }
    );

    recordPhaseFailure(phase, error, 100, 175);

    expect(phase).toMatchObject({
      durationMs: 75,
      error: 'Child process launch failed (ENOENT).',
      exitCode: null,
      outcome: 'failed',
    });
    expect(JSON.stringify(phase)).not.toContain('top-secret');
    expect(JSON.stringify(phase)).not.toContain('SERVICE_TOKEN');
  });
});
