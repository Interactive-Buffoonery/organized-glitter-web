import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadActionlintArchive, verifyActionlintChecksum } from '../lint-workflows.mjs';

const tempDirs = [];

const makeTempDir = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'og-actionlint-'));
  tempDirs.push(directory);
  return directory;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe('actionlint download', () => {
  it('retries a 504 and keeps a successful archive', async () => {
    const archivePath = path.join(makeTempDir(), 'actionlint.tar.gz');
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 504 })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      });

    await downloadActionlintArchive('https://example.test/actionlint.tar.gz', archivePath, {
      fetchFn,
      sleepFn: async () => {},
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(readFileSync(archivePath)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('retries a network failure and then writes the archive', async () => {
    const archivePath = path.join(makeTempDir(), 'actionlint.tar.gz');
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Uint8Array.from([9]).buffer,
      });

    await downloadActionlintArchive('https://example.test/actionlint.tar.gz', archivePath, {
      fetchFn,
      sleepFn: async () => {},
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(readFileSync(archivePath)).toEqual(Buffer.from([9]));
  });

  it('does not retry a 404', async () => {
    const archivePath = path.join(makeTempDir(), 'actionlint.tar.gz');
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(
      downloadActionlintArchive('https://example.test/actionlint.tar.gz', archivePath, {
        fetchFn,
        sleepFn: async () => {},
      })
    ).rejects.toThrow('Actionlint download failed (404).');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated 504 responses', async () => {
    const archivePath = path.join(makeTempDir(), 'actionlint.tar.gz');
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 504 });

    await expect(
      downloadActionlintArchive('https://example.test/actionlint.tar.gz', archivePath, {
        fetchFn,
        retries: 3,
        sleepFn: async () => {},
      })
    ).rejects.toThrow('Actionlint download failed (504).');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('deletes a cached archive that fails the checksum', () => {
    const archivePath = path.join(makeTempDir(), 'actionlint.tar.gz');
    writeFileSync(archivePath, 'not-the-pinned-bytes');

    expect(() => verifyActionlintChecksum(archivePath, 'abc')).toThrow(
      'Actionlint archive checksum mismatch.'
    );
    expect(() => readFileSync(archivePath)).toThrow(/ENOENT/);
  });
});
