import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import ciConfig from '../../playwright.ci.config';
import {
  parseArgs,
  parseListedTestCount,
  pocketBaseCachePath,
  resolveQaFixtures,
  waitForHttp,
} from '../run-local-release-qa.mjs';
import {
  hasVerifiedCachedBinary,
  installPocketBase,
  POCKETBASE_BASELINE_VERSION,
  POCKETBASE_VERSION,
  resolveArchive,
  verifyArchive,
} from '../install-pocketbase.mjs';

describe('PocketBase installer', () => {
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
      return new Response('', { status: 503 });
    });
    try {
      await expect(
        installPocketBase({
          arch: 'x64',
          destination: path.join(directory, 'pocketbase'),
          fetchFn,
          platform: 'linux',
        })
      ).rejects.toThrow(/HTTP 503/);
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
    const parsed = parseArgs(['--suite=smoke', '--fixed-ports', '--skip-build']);
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

  it('rejects a dynamic-port build artifact because its backend URL cannot be changed', () => {
    expect(() => parseArgs(['--suite=smoke', '--skip-build'])).toThrow(/requires --fixed-ports/i);
  });

  it('fails rather than passing when Playwright discovers no tests', () => {
    expect(() => parseListedTestCount('Total: 0 tests in 0 files')).toThrow(/found no tests/i);
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
});
