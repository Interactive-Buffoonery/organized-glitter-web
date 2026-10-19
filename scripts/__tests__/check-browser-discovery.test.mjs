import { describe, expect, it, vi } from 'vitest';

import {
  checkBrowserDiscovery,
  discoveryEnv,
  runBoundedCommand,
} from '../check-browser-discovery.mjs';

const listed = { smoke: 'Total: 95 tests in 24 files', full: 'Total: 310 tests in 41 files' };

describe('browser discovery check', () => {
  it('lists each managed suite exactly once with the synthetic fixture environment', async () => {
    const run = vi.fn(async (_command, _args, { env }) => ({
      status: 0,
      stdout: `Listing tests:\n${listed[env.E2E_QA_SUITE]}\n`,
      stderr: '',
    }));

    await expect(checkBrowserDiscovery({ run })).resolves.toEqual({
      smoke: { files: 24, tests: 95 },
      full: { files: 41, tests: 310 },
    });
    expect(run).toHaveBeenCalledTimes(2);
    for (const suite of ['smoke', 'full']) {
      const [, args, options] = run.mock.calls.find(([, , { env }]) => env.E2E_QA_SUITE === suite);
      expect(args).toEqual(
        expect.arrayContaining(['test', '--config=playwright.ci.config.ts', '--list'])
      );
      expect(options.timeoutMs).toBeGreaterThan(0);
      expect(options.env.E2E_TEST_EMAIL).toBe('inventory@example.test');
    }
  });

  it('fails with the child status and output when Playwright exits nonzero', async () => {
    const run = async () => ({ status: 1, stdout: listed.smoke, stderr: 'Error: bad config' });

    await expect(checkBrowserDiscovery({ run, suites: ['smoke'] })).rejects.toThrow(
      /smoke.*exited with status 1[\s\S]*bad config/i
    );
  });

  it('fails closed when the Total line is missing or malformed', async () => {
    for (const stdout of ['Listing tests:\n', 'Total: many tests in 24 files', 'Total: 95 tests']) {
      const run = async () => ({ status: 0, stdout, stderr: '' });
      await expect(checkBrowserDiscovery({ run, suites: ['smoke'] })).rejects.toThrow(
        /complete managed test inventory/i
      );
    }
  });

  it('fails when discovered files or tests differ from the managed inventory', async () => {
    const run = async () => ({ status: 0, stdout: 'Total: 95 tests in 23 files', stderr: '' });

    await expect(checkBrowserDiscovery({ run, suites: ['smoke'] })).rejects.toThrow(
      /expected 95 tests in 24 files/i
    );
  });

  it('keeps the inherited environment but pins the synthetic fixtures', () => {
    const env = discoveryEnv('full', { PATH: '/bin', E2E_TEST_EMAIL: 'real@person.test' });

    expect(env.PATH).toBe('/bin');
    expect(env.E2E_QA_SUITE).toBe('full');
    expect(env.E2E_TEST_EMAIL).toBe('inventory@example.test');
    expect(env.E2E_RANDOMIZER_PROJECT_IDS.split(',')).toHaveLength(8);
  });
});

describe('bounded discovery command', () => {
  it('returns the exit status and output of a finished child', async () => {
    await expect(
      runBoundedCommand(process.execPath, ['-e', 'console.log("ok"); process.exit(3)'], {
        env: process.env,
        timeoutMs: 10_000,
      })
    ).resolves.toEqual({ status: 3, stdout: 'ok\n', stderr: '' });
  });

  it('stops a child that outlives its timeout and says so', async () => {
    const started = Date.now();

    await expect(
      runBoundedCommand(process.execPath, ['-e', 'setTimeout(() => {}, 60_000)'], {
        env: process.env,
        timeoutMs: 200,
      })
    ).rejects.toThrow(/timed out after 200 ms/i);
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
