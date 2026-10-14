import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
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

// Keep the event loop available to answer the CLI's release lookup on loopback.
const spawnPosthogCliAsync = (cliBin, args, { cwd, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(cliBin, args, {
      cwd,
      env: { ...cliProcessEnv(), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', chunk => (stderr += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });

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

  it('bounds a stalled CLI and still strips maps without failing the build', () => {
    const fsApi = {
      existsSync: () => true,
      readdirSync: () => ['main.js.map'],
      statSync: () => ({ isDirectory: () => false }),
      rmSync: vi.fn(),
    };
    const spawnSyncFn = vi
      .fn()
      .mockReturnValue({ error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }) });
    const logger = makeLogger();
    expect(
      runSourcemapUpload({
        projectRoot: '/synthetic-build',
        distDir: '/synthetic-build/dist',
        env: {
          POSTHOG_CLI_TOKEN: 'synthetic-token',
          POSTHOG_CLI_PROJECT_ID: '1',
          VITE_APP_VERSION: 'test',
        },
        spawnSyncFn,
        logger,
        fsApi,
      })
    ).toBe(0);
    expect(spawnSyncFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ timeout: 120_000, killSignal: 'SIGKILL' })
    );
    expect(fsApi.rmSync).toHaveBeenCalledWith('/synthetic-build/dist/main.js.map');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('timed out'));
  });

  it('keeps the installed PostHog CLI sourcemap contract executable', async () => {
    const rootDir = makeTempDir();
    const cliBin = path.resolve('node_modules/.bin/posthog-cli');
    const releaseId = '123e4567-e89b-42d3-a456-426614174000';
    const requests = [];
    const server = createServer((request, response) => {
      requests.push({ method: request.method, url: request.url });
      const lookup = request.url.match(
        /^\/api\/projects\/1\/error_tracking\/releases\/hash\/([^/]+)\/?$/
      );
      if (request.method !== 'GET' || !lookup) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          id: releaseId,
          hash_id: lookup[1],
          version: 'fixture-v1',
          project: 'sourcemap-contract-fixture',
        })
      );
    });
    // The CLI wrapper downloads its native binary from GitHub Releases when
    // postinstall did not leave one in node_modules. Retry --help so a
    // transient 502/504 does not fail the contract check.
    const injectHelp = spawnPosthogCli(cliBin, ['sourcemap', 'inject', '--help'], { attempts: 4 });
    const uploadHelp = spawnPosthogCli(cliBin, ['sourcemap', 'upload', '--help'], { attempts: 4 });

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const script = writeFixtureFile(
        rootDir,
        'main.js',
        'console.log("fixture");\n//# sourceMappingURL=main.js.map\n'
      );
      const sourcemap = writeFixtureFile(
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
      const inject = await spawnPosthogCliAsync(
        cliBin,
        [
          'sourcemap',
          'inject',
          '--directory',
          rootDir,
          '--release-name',
          'sourcemap-contract-fixture',
          '--release-version',
          'fixture-v1',
        ],
        {
          cwd: rootDir,
          env: {
            POSTHOG_CLI_API_KEY: 'phx_local_test_posthog_cli_key',
            POSTHOG_CLI_PROJECT_ID: '1',
            POSTHOG_CLI_HOST: `http://127.0.0.1:${server.address().port}`,
          },
        }
      );

      expect(injectHelp.status, formatCliResult(injectHelp)).toBe(0);
      expect(injectHelp.stdout).toContain('--directory');
      expect(uploadHelp.status, formatCliResult(uploadHelp)).toBe(0);
      expect(uploadHelp.stdout).toContain('--directory');
      expect(uploadHelp.stdout).toContain('--release-name');
      expect(uploadHelp.stdout).toContain('--release-version');
      expect(uploadHelp.stdout).toContain('--delete-after');
      expect(inject.status, formatCliResult(inject)).toBe(0);
      expect(inject.stderr).not.toMatch(/unexpected argument|Usage:/i);
      expect(requests).toEqual([
        {
          method: 'GET',
          url: expect.stringMatching(/^\/api\/projects\/1\/error_tracking\/releases\/hash\//),
        },
      ]);
      const injectedScript = readFileSync(script, 'utf8');
      const chunkId = injectedScript.match(/\/\/# chunkId=([^\s]+)/)?.[1];
      expect(chunkId).toMatch(/^[0-9a-f-]{36}$/);
      expect(JSON.parse(readFileSync(sourcemap, 'utf8'))).toMatchObject({
        chunk_id: chunkId,
        release_id: releaseId,
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
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
