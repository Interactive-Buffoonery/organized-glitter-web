import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import ciConfig from '../../playwright.ci.config';
import {
  parseArgs,
  parseListedInventory,
  parseListedTestCount,
  parseRandomizerFixtureIds,
  pocketBaseCachePath,
  resolveQaFixtures,
  seedRandomizerFixturesForSuite,
  validateManagedPlaywrightReport,
  waitForHttp,
} from '../run-local-release-qa.mjs';
import {
  hasVerifiedCachedBinary,
  downloadPocketBaseArchive,
  installPocketBase,
  POCKETBASE_BASELINE_VERSION,
  POCKETBASE_VERSION,
  resolveArchive,
  verifyArchive,
} from '../install-pocketbase.mjs';

describe('PocketBase installer', () => {
  it('retries a transient HTTP 500 before accepting the archive bytes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('archive'));
    const sleepFn = vi.fn(async () => {});
    await expect(
      downloadPocketBaseArchive('https://example.test/pocketbase.zip', { fetchFn, sleepFn })
    ).resolves.toEqual(Buffer.from('archive'));
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleepFn).toHaveBeenCalledWith(250);
  });

  it('retries transport and response-body failures with fresh abort signals', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => {
          throw new TypeError('connection closed');
        },
      })
      .mockResolvedValueOnce(new Response('archive'));
    const sleepFn = vi.fn(async () => {});
    await expect(
      downloadPocketBaseArchive('https://example.test/pocketbase.zip', { fetchFn, sleepFn })
    ).resolves.toEqual(Buffer.from('archive'));
    const signals = fetchFn.mock.calls.map(([, options]) => options.signal);
    expect(new Set(signals).size).toBe(3);
    expect(signals.every(signal => signal instanceof AbortSignal)).toBe(true);
    expect(sleepFn.mock.calls).toEqual([[250], [500]]);
  });

  it.each([500, 502, 503, 504])('stops after three HTTP %i failures', async status => {
    const fetchFn = vi.fn(async () => new Response('', { status }));
    const sleepFn = vi.fn(async () => {});
    await expect(
      downloadPocketBaseArchive('https://example.test/pocketbase.zip', { fetchFn, sleepFn })
    ).rejects.toThrow(`HTTP ${status}`);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a missing release asset', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 404 }));
    const sleepFn = vi.fn(async () => {});
    await expect(
      downloadPocketBaseArchive('https://example.test/pocketbase.zip', { fetchFn, sleepFn })
    ).rejects.toThrow('HTTP 404');
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('still rejects tampered bytes after a successful retry', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-pocketbase-retry-'));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('tampered'));
    const spawnSyncFn = vi.fn();
    try {
      await expect(
        installPocketBase({
          destination: path.join(directory, 'pocketbase'),
          fetchFn,
          sleepFn: async () => {},
          spawnSyncFn,
          platform: 'linux',
          arch: 'x64',
        })
      ).rejects.toThrow(/checksum mismatch/i);
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(spawnSyncFn).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('pins checksum-verified macOS and Linux archives', () => {
    expect(resolveArchive('darwin', 'arm64')).toMatchObject({
      archive: 'pocketbase_0.40.4_darwin_arm64.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(resolveArchive('linux', 'x64')).toMatchObject({
      archive: 'pocketbase_0.40.4_linux_amd64.zip',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('keeps a checksum-verified 0.40.1 baseline for upgrade checks', () => {
    expect(resolveArchive('linux', 'x64', POCKETBASE_BASELINE_VERSION)).toMatchObject({
      archive: 'pocketbase_0.40.1_linux_amd64.zip',
      sha256: '0f3442d2e57b03b56fbff0d09289e4a30b4f561a44338c38d2dcd4a1a0cfa91e',
    });
    expect(() => resolveArchive('linux', 'x64', 'untrusted')).toThrow(/does not support/);
  });

  it('caches the current PocketBase release away from the upgrade baseline', () => {
    expect(pocketBaseCachePath).toContain(`${POCKETBASE_VERSION}/pocketbase`);
    expect(pocketBaseCachePath).not.toContain(`${POCKETBASE_BASELINE_VERSION}/pocketbase`);
  });

  it('rejects an archive whose bytes do not match the pinned checksum', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-pocketbase-checksum-'));
    const archive = path.join(directory, 'pocketbase.zip');
    try {
      writeFileSync(archive, 'tampered');
      expect(() => verifyArchive(archive, '0'.repeat(64))).toThrow(/checksum mismatch/i);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not trust release metadata when the cached executable is tampered', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-pocketbase-cache-'));
    const binary = path.join(directory, 'pocketbase');
    try {
      writeFileSync(binary, 'tampered');
      expect(hasVerifiedCachedBinary(binary, resolveArchive('linux', 'x64'))).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('bounds a stalled download with an abort signal', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-pocketbase-fetch-'));
    const fetchFn = vi.fn(async (_url, options) => {
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return new Response('', { status: 404 });
    });
    try {
      await expect(
        installPocketBase({
          arch: 'x64',
          destination: path.join(directory, 'pocketbase'),
          fetchFn,
          platform: 'linux',
        })
      ).rejects.toThrow(/HTTP 404/);
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('browser QA harness safeguards', () => {
  it('keeps legacy Playwright positional filters working', () => {
    const parsed = parseArgs(['--', '--project=authenticated', 'e2e/example.spec.ts']);
    expect(parsed.harness.suite).toBe('legacy');
    expect(parsed.configPath).toBe('playwright.config.ts');
    expect(parsed.playwrightArgs).toEqual(['--project=authenticated', 'e2e/example.spec.ts']);
  });

  it('uses the fixed smoke inventory without retries or screen atlas projects', () => {
    const parsed = parseArgs(['--suite=smoke', '--fixed-ports']);
    expect(parsed.configPath).toBe('playwright.ci.config.ts');
    expect(parsed.playwrightArgs).toEqual([]);
    expect(ciConfig.retries).toBe(0);
    expect(ciConfig.testIgnore).toBe('**/screen-review/**');
    expect(ciConfig.projects?.map(project => project.name)).toEqual([
      'setup',
      'public-chromium-smoke',
      'authenticated-chromium-smoke',
      'mobile-webkit-smoke',
    ]);
  });

  it('seeds randomizer fixtures only for the managed full suite', () => {
    const ids = Array.from(
      { length: 8 },
      (_, index) => `fixture${String(index + 1).padStart(8, '0')}`
    );
    const runCommand = vi.fn(() => ({
      stdout: `E2E_RANDOMIZER_PROJECT_IDS=${ids.join(',')}\n`,
    }));
    const options = {
      env: { VITE_POCKETBASE_URL: 'http://127.0.0.1:8090' },
      logsDir: '/logs',
      runCommand,
    };

    expect(seedRandomizerFixturesForSuite({ ...options, suite: 'smoke' })).toEqual([]);
    expect(runCommand).not.toHaveBeenCalled();
    expect(seedRandomizerFixturesForSuite({ ...options, suite: 'full' })).toEqual(ids);
    expect(runCommand).toHaveBeenCalledWith({
      command: process.execPath,
      args: ['scripts/seed-e2e-randomizer-fixture.mjs'],
      env: options.env,
      logPath: '/logs/randomizer-fixture-seed.log',
      label: 'Randomizer fixture seed',
    });
  });

  it('rejects missing or incomplete randomizer seed output', () => {
    expect(() => parseRandomizerFixtureIds('seed complete\n')).toThrow(/did not report/i);
    expect(() =>
      parseRandomizerFixtureIds('E2E_RANDOMIZER_PROJECT_IDS=fixture00000001,fixture00000002\n')
    ).toThrow(/expected 8 unique project ids/i);
  });

  it('rejects build reuse without a matching build receipt', () => {
    expect(() => parseArgs(['--suite=smoke', '--fixed-ports', '--skip-build'])).toThrow(
      /not supported/i
    );
  });

  it('fails rather than passing when Playwright discovers no tests', () => {
    expect(() => parseListedTestCount('Total: 0 tests in 0 files')).toThrow(/found no tests/i);
  });

  it('requires the exact managed inventory for smoke and full suites', () => {
    expect(parseListedInventory('Total: 83 tests in 23 files', 'smoke')).toEqual({
      files: 23,
      tests: 83,
    });
    expect(parseListedInventory('Total: 290 tests in 40 files', 'full')).toEqual({
      files: 40,
      tests: 290,
    });
    expect(() => parseListedInventory('Total: 76 tests in 23 files', 'smoke')).toThrow(
      /expected 83 tests in 23 files/i
    );
  });

  it.each(['smoke', 'full'])('matches Playwright discovery for the %s suite', suite => {
    const output = execFileSync(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['exec', 'playwright', 'test', '--config=playwright.ci.config.ts', '--list'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          E2E_QA_SUITE: suite,
          E2E_APP_URL: 'http://127.0.0.1:3000',
          VITE_POCKETBASE_URL: 'http://127.0.0.1:8090',
          E2E_TEST_EMAIL: 'inventory@example.test',
          E2E_TEST_PASSWORD: 'inventory-test-password',
          E2E_FIXTURE_PROJECT_ID: 'localproject003',
          E2E_COLORING_BOOK_ID: 'localbook000001',
          E2E_COLORING_PAGE_ID: 'localpage000001',
          E2E_COLORING_MEDIUM_ID: 'localmedium0001',
          E2E_RANDOMIZER_PROJECT_IDS: Array.from(
            { length: 8 },
            (_, index) => `localproject00${index + 1}`
          ).join(','),
        },
      }
    );
    expect(parseListedInventory(output, suite).tests).toBeGreaterThan(0);
  });

  it('accepts a reconciled smoke report with no skipped tests', () => {
    const tests = Array.from({ length: 83 }, (_, index) => ({
      projectName: 'authenticated-chromium-smoke',
      expectedStatus: 'passed',
      status: 'expected',
      results: [{ status: 'passed', retry: 0, annotations: [] }],
      annotations: [],
      title: `test ${index}`,
    }));
    const report = {
      suites: [
        {
          title: 'e2e/example.spec.ts',
          specs: [{ title: 'generated smoke tests', file: 'e2e/example.spec.ts', tests }],
        },
      ],
      errors: [],
      stats: { expected: 83, unexpected: 0, flaky: 0, skipped: 0 },
    };

    expect(validateManagedPlaywrightReport(report, 'smoke')).toEqual({
      expected: 83,
      skipped: 0,
      total: 83,
    });
  });

  it('rejects empty, malformed, or unreconciled managed reports', () => {
    expect(() => validateManagedPlaywrightReport({}, 'smoke')).toThrow(/structured report/i);
    expect(() =>
      validateManagedPlaywrightReport(
        {
          suites: [
            {
              title: 'e2e/example.spec.ts',
              specs: [{ title: 'empty', file: 'e2e/example.spec.ts', tests: [] }],
            },
          ],
          errors: [],
          stats: { expected: 83, unexpected: 0, flaky: 0, skipped: 0 },
        },
        'smoke'
      )
    ).toThrow(/contained no tests/i);
  });

  it('allows only the exact conditional full-suite skip', () => {
    const passing = Array.from({ length: 289 }, (_, index) => ({
      projectName: 'authenticated-chromium-full',
      expectedStatus: 'passed',
      status: 'expected',
      results: [{ status: 'passed', retry: 0, annotations: [] }],
      annotations: [],
      title: `test ${index}`,
    }));
    const allowedSkip = {
      projectName: 'authenticated-chromium-full',
      expectedStatus: 'skipped',
      status: 'skipped',
      results: [],
      annotations: [
        {
          type: 'skip',
          description: 'page too short to verify bottom nav scroll anchoring',
        },
      ],
      title: 'bottom nav remains anchored during scroll',
    };
    const report = {
      suites: [
        {
          title: 'e2e/authenticated/mobile-touch-targets.spec.ts',
          suites: [
            {
              title: 'mobile touch targets',
              specs: [
                {
                  title: 'generated passing tests',
                  file: 'e2e/authenticated/mobile-touch-targets.spec.ts',
                  tests: passing,
                },
                {
                  title: 'bottom nav remains anchored during scroll',
                  file: 'e2e/authenticated/mobile-touch-targets.spec.ts',
                  tests: [allowedSkip],
                },
              ],
            },
          ],
        },
      ],
      errors: [],
      stats: { expected: 289, unexpected: 0, flaky: 0, skipped: 1 },
    };

    expect(validateManagedPlaywrightReport(report, 'full')).toEqual({
      expected: 289,
      skipped: 1,
      total: 290,
    });

    allowedSkip.annotations[0].description = 'different reason';
    expect(() => validateManagedPlaywrightReport(report, 'full')).toThrow(/unexpected skip/i);
  });

  it('reports an early server exit instead of waiting for a startup timeout', async () => {
    await expect(
      waitForHttp('http://127.0.0.1:1', 'fixture server', {
        fetchFn: vi.fn(),
        processHandle: { exitCode: 12 },
      })
    ).rejects.toThrow('exited before becoming ready with status 12');
  });

  it('fails when bootstrap omits a required fixture', async () => {
    const fetchFn = vi.fn(async url => {
      if (String(url).endsWith('/auth-with-password')) {
        return new Response(JSON.stringify({ token: 'fake-token' }), { status: 200 });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchFn);

    try {
      await expect(
        resolveQaFixtures({
          pbUrl: 'http://127.0.0.1:8090',
          email: 'fixture@example.test',
          password: 'fixture-password',
        })
      ).rejects.toThrow('required fixture projects/localproject003');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails when a seeded randomizer fixture is not an eligible progress project', async () => {
    const randomizerProjectIds = Array.from(
      { length: 8 },
      (_, index) => `fixture${String(index + 1).padStart(8, '0')}`
    );
    const fetchFn = vi.fn(async url => {
      const value = String(url);
      if (value.endsWith('/auth-with-password')) {
        return new Response(JSON.stringify({ token: 'fake-token' }), { status: 200 });
      }
      const randomizerId = randomizerProjectIds.find(id => value.endsWith(`/records/${id}`));
      if (randomizerId) {
        return new Response(
          JSON.stringify({
            id: randomizerId,
            status: randomizerId === randomizerProjectIds[3] ? 'stash' : 'progress',
          }),
          { status: 200 }
        );
      }
      if (/\/(projects|coloring_books|coloring_mediums)\/records\//.test(value)) {
        return new Response(JSON.stringify({ id: value.split('/').at(-1) }), { status: 200 });
      }
      return new Response(JSON.stringify({ items: [{ id: 'localpage000001' }] }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchFn);

    try {
      await expect(
        resolveQaFixtures({
          pbUrl: 'http://127.0.0.1:8090',
          email: 'fixture@example.test',
          password: 'fixture-password',
          randomizerProjectIds,
        })
      ).rejects.toThrow(`randomizer fixture ${randomizerProjectIds[3]} is not in progress`);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
