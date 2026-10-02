import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  deleteSourcemaps,
  resolveReleaseVersion,
  runSourcemapUpload,
} from '../upload-sourcemaps.mjs';

const makeTempDir = () => mkdtempSync(path.join(tmpdir(), 'og-sourcemaps-'));

const writeFixtureFile = (rootDir, relativePath, content = 'x') => {
  const filePath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  return filePath;
};

const makeLogger = () => ({
  log: vi.fn(),
  error: vi.fn(),
});

const cliProcessEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('POSTHOG_CLI_'))
  );

const formatCliResult = result =>
  `status=${result.status} signal=${result.signal ?? ''} error=${result.error?.message ?? ''}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;

const spawnPosthogCli = (cliBin, args, { cwd, env, attempts = 1, timeout = 15_000 } = {}) => {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    result = spawnSync(cliBin, args, {
      encoding: 'utf8',
      cwd,
      env: { ...cliProcessEnv(), ...env },
      timeout,
    });
    if (result.status === 0) return result;
  }
  return result;
};

describe('upload-sourcemaps script', () => {
  it('recursively removes sourcemaps and leaves other build files', () => {
    const rootDir = makeTempDir();

    try {
      const rootMap = writeFixtureFile(rootDir, 'main.js.map');
      const nestedMap = writeFixtureFile(rootDir, 'assets/chunk.js.map');
      const script = writeFixtureFile(rootDir, 'assets/chunk.js');

      expect(deleteSourcemaps(rootDir)).toBe(2);
      expect(existsSync(rootMap)).toBe(false);
      expect(existsSync(nestedMap)).toBe(false);
      expect(readFileSync(script, 'utf8')).toBe('x');
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('returns a failing status when dist is missing', () => {
    const rootDir = makeTempDir();
    const logger = makeLogger();

    try {
      const status = runSourcemapUpload({
        projectRoot: rootDir,
        distDir: path.join(rootDir, 'dist'),
        env: {},
        spawnSyncFn: vi.fn(),
        logger,
      });

      expect(status).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('dist directory not found')
      );
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('skips CLI calls without credentials and still deletes local maps', () => {
    const rootDir = makeTempDir();
    const distDir = path.join(rootDir, 'dist');
    const spawnSyncFn = vi.fn();
    const logger = makeLogger();

    try {
      writeFixtureFile(distDir, 'main.js.map');

      const status = runSourcemapUpload({
        projectRoot: rootDir,
        distDir,
        env: {},
        spawnSyncFn,
        logger,
      });

      expect(status).toBe(0);
      expect(spawnSyncFn).not.toHaveBeenCalled();
      expect(existsSync(path.join(distDir, 'main.js.map'))).toBe(false);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('skipping upload'));
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('skips CLI calls when only part of the credential pair is configured', () => {
    const rootDir = makeTempDir();
    const distDir = path.join(rootDir, 'dist');
    const spawnSyncFn = vi.fn();
    const logger = makeLogger();

    try {
      writeFixtureFile(distDir, 'main.js.map');

      const status = runSourcemapUpload({
        projectRoot: rootDir,
        distDir,
        env: { POSTHOG_CLI_TOKEN: 'token' },
        spawnSyncFn,
        logger,
      });

      expect(status).toBe(0);
      expect(spawnSyncFn).not.toHaveBeenCalled();
      expect(existsSync(path.join(distDir, 'main.js.map'))).toBe(false);
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('skipping upload'));
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the installed PostHog CLI sourcemap contract executable', () => {
    const rootDir = makeTempDir();
    const cliBin = path.resolve('node_modules/.bin/posthog-cli');
    // The CLI wrapper downloads its native binary from GitHub Releases when
    // postinstall did not leave one in node_modules. Retry --help so a
    // transient 502/504 does not fail the contract check.
    const injectHelp = spawnPosthogCli(cliBin, ['sourcemap', 'inject', '--help'], { attempts: 4 });
    const uploadHelp = spawnPosthogCli(cliBin, ['sourcemap', 'upload', '--help'], { attempts: 4 });

    try {
      const script = writeFixtureFile(
        rootDir,
        'main.js',
        'console.log("fixture");\n//# sourceMappingURL=main.js.map\n'
      );
      writeFixtureFile(
        rootDir,
        'main.js.map',
        JSON.stringify({
          version: 3,
          file: 'main.js',
          sources: ['main.ts'],
          names: [],
          mappings: '',
        })
      );
      const inject = spawnPosthogCli(cliBin, ['sourcemap', 'inject', '--directory', rootDir], {
        cwd: rootDir,
        env: {
          POSTHOG_CLI_API_KEY: 'local-test-posthog-cli-key',
          POSTHOG_CLI_PROJECT_ID: '1',
          POSTHOG_CLI_HOST: 'http://127.0.0.1:1',
        },
      });

      expect(injectHelp.status, formatCliResult(injectHelp)).toBe(0);
      expect(injectHelp.stdout).toContain('--directory');
      expect(uploadHelp.status, formatCliResult(uploadHelp)).toBe(0);
      expect(uploadHelp.stdout).toContain('--directory');
      expect(uploadHelp.stdout).toContain('--release-name');
      expect(uploadHelp.stdout).toContain('--release-version');
      expect(uploadHelp.stdout).toContain('--delete-after');
      expect([0, 1]).toContain(inject.status);
      expect(inject.stderr).not.toMatch(/unexpected argument|Usage:/i);
      if (inject.status === 0) {
        expect(readFileSync(script, 'utf8')).toContain('//# chunkId=');
      } else {
        expect(inject.stderr).toContain('found 1 pairs');
        expect(inject.stderr).toMatch(/Request error|error sending request/i);
      }
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('injects and uploads sourcemaps with explicit release metadata when credentials exist', () => {
    const rootDir = makeTempDir();
    const distDir = path.join(rootDir, 'dist');
    const spawnSyncFn = vi.fn().mockReturnValue({ status: 0 });
    const logger = makeLogger();

    try {
      writeFixtureFile(distDir, 'main.js.map');

      const status = runSourcemapUpload({
        projectRoot: rootDir,
        distDir,
        env: {
          POSTHOG_CLI_TOKEN: 'token',
          POSTHOG_CLI_PROJECT_ID: 'project',
          GITHUB_SHA: 'abc123',
        },
        spawnSyncFn,
        logger,
      });

      expect(status).toBe(0);
      expect(spawnSyncFn).toHaveBeenCalledTimes(2);
      expect(spawnSyncFn.mock.calls[0][1]).toEqual(['sourcemap', 'inject', '--directory', distDir]);
      expect(spawnSyncFn.mock.calls[1][1]).toEqual([
        'sourcemap',
        'upload',
        '--directory',
        distDir,
        '--release-name',
        'organized-glitter',
        '--release-version',
        'abc123',
        '--delete-after',
      ]);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps CLI upload failure non-fatal and deletes residual sourcemaps', () => {
    const rootDir = makeTempDir();
    const distDir = path.join(rootDir, 'dist');
    const spawnSyncFn = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 2 });
    const logger = makeLogger();

    try {
      writeFixtureFile(distDir, 'main.js.map');

      const status = runSourcemapUpload({
        projectRoot: rootDir,
        distDir,
        env: {
          POSTHOG_CLI_API_KEY: 'token',
          POSTHOG_CLI_ENV_ID: 'project',
          VITE_APP_VERSION: 'local-build',
        },
        spawnSyncFn,
        logger,
      });

      expect(status).toBe(0);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Upload failed'));
      expect(existsSync(path.join(distDir, 'main.js.map'))).toBe(false);
    } finally {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('prefers GitHub SHA over Railway SHA over Vite app version for release version', () => {
    expect(
      resolveReleaseVersion({
        GITHUB_SHA: 'github',
        RAILWAY_GIT_COMMIT_SHA: 'railway',
        VITE_APP_VERSION: 'vite',
      })
    ).toBe('github');
    expect(
      resolveReleaseVersion({
        RAILWAY_GIT_COMMIT_SHA: 'railway',
        VITE_APP_VERSION: 'vite',
      })
    ).toBe('railway');
    expect(resolveReleaseVersion({ VITE_APP_VERSION: 'vite' })).toBe('vite');
  });
});
