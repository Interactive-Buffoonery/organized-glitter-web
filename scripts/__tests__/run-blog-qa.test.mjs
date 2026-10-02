import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
  fixtureClose: vi.fn(),
  mkdir: vi.fn(),
  open: vi.fn(),
  serverLogClose: vi.fn(),
  spawn: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, spawn: mocks.spawn },
    spawn: mocks.spawn,
  };
});
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, createWriteStream: mocks.createWriteStream },
    createWriteStream: mocks.createWriteStream,
  };
});
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: mocks.mkdir,
    open: mocks.open,
    writeFile: mocks.writeFile,
  },
}));
vi.mock('../../e2e/blog/wordpress-fixture.mjs', () => ({
  startWordPressFixture: vi.fn(async () => ({
    close: mocks.fixtureClose,
    url: 'http://127.0.0.1:1234',
  })),
}));

describe('blog QA runner', () => {
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach(mock => mock.mockReset());
    mocks.open.mockResolvedValue({ fd: 42, close: mocks.serverLogClose });
    process.exitCode = originalExitCode;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('closes the command log when the child process cannot spawn', async () => {
    const log = new PassThrough();
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    mocks.createWriteStream.mockReturnValue(log);
    mocks.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
      return child;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../run-blog-qa.mjs');

    expect(log.writableEnded).toBe(true);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/failure\.txt$/),
      expect.stringContaining('spawn failed')
    );
    expect(mocks.fixtureClose).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(1);
  });

  it('preserves a spawn failure when closing the command log also fails', async () => {
    const logError = new Error('log close failed');
    const log = new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
      final(callback) {
        callback(logError);
      },
    });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    mocks.createWriteStream.mockReturnValue(log);
    mocks.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
      return child;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../run-blog-qa.mjs');

    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/failure\.txt$/),
      expect.stringContaining('spawn failed')
    );
    expect(mocks.writeFile).not.toHaveBeenCalledWith(
      expect.stringMatching(/failure\.txt$/),
      expect.stringContaining(logError.message)
    );
  });

  it('surfaces a command log failure while the child is still running', async () => {
    const logError = new Error('log write failed');
    const log = new PassThrough();
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const endLog = vi.spyOn(log, 'end');
    child.kill = vi.fn(() => {
      queueMicrotask(() => child.emit('close', null, 'SIGKILL'));
      return true;
    });
    mocks.createWriteStream.mockImplementation(() => {
      queueMicrotask(() => log.destroy(logError));
      return log;
    });
    mocks.spawn.mockReturnValue(child);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await Promise.race([
      import('../run-blog-qa.mjs').then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('timed out'), 100)),
    ]);

    expect(result).toBe('settled');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(endLog).toHaveBeenCalledOnce();
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/failure\.txt$/),
      expect.stringContaining(logError.message)
    );
  });

  it('observes an app server signal exit before readiness cleanup', async () => {
    const buildLog = new PassThrough();
    const buildChild = new EventEmitter();
    buildChild.stdout = new PassThrough();
    buildChild.stderr = new PassThrough();
    const appServer = new EventEmitter();
    appServer.exitCode = null;
    appServer.signalCode = null;
    appServer.kill = vi.fn();
    mocks.createWriteStream.mockReturnValue(buildLog);
    mocks.spawn
      .mockImplementationOnce(() => {
        queueMicrotask(() => buildChild.emit('close', 0, null));
        return buildChild;
      })
      .mockImplementationOnce(() => {
        queueMicrotask(() => {
          appServer.signalCode = 'SIGTERM';
          appServer.emit('close', null, 'SIGTERM');
        });
        return appServer;
      });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await Promise.race([
      import('../run-blog-qa.mjs').then(() => 'settled'),
      new Promise(resolve => setTimeout(() => resolve('timed out'), 100)),
    ]);

    expect(result).toBe('settled');
    expect(appServer.kill).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/failure\.txt$/),
      expect.stringContaining('exited before QA')
    );
    expect(mocks.serverLogClose).toHaveBeenCalledOnce();
  });

  it('reports an app server spawn error without an unhandled event', async () => {
    const buildLog = new PassThrough();
    const buildChild = new EventEmitter();
    buildChild.stdout = new PassThrough();
    buildChild.stderr = new PassThrough();
    const appServer = new EventEmitter();
    appServer.exitCode = null;
    appServer.signalCode = null;
    appServer.kill = vi.fn();
    mocks.createWriteStream.mockReturnValue(buildLog);
    mocks.spawn
      .mockImplementationOnce(() => {
        queueMicrotask(() => buildChild.emit('close', 0, null));
        return buildChild;
      })
      .mockImplementationOnce(() => {
        queueMicrotask(() => appServer.emit('error', new Error('server spawn failed')));
        return appServer;
      });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../run-blog-qa.mjs');

    expect(appServer.kill).not.toHaveBeenCalled();
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/failure\.txt$/),
      expect.stringContaining('server spawn failed')
    );
    expect(mocks.serverLogClose).toHaveBeenCalledOnce();
  });
});
