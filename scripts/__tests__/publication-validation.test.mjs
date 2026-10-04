import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  assertScannerResult,
  copyPublicationSourceTree,
  extractVerifiedGitleaks,
  publicationScanPlan,
  resolveGitleaksArchive,
} from '../run-publication-validation.mjs';

describe('publication validation', () => {
  it('pins official Gitleaks archives for supported local and CI hosts', () => {
    expect(resolveGitleaksArchive('darwin', 'arm64')).toMatchObject({
      archive: 'gitleaks_8.30.1_darwin_arm64.tar.gz',
      sha256: 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
    });
    expect(resolveGitleaksArchive('linux', 'x64')).toMatchObject({
      archive: 'gitleaks_8.30.1_linux_x64.tar.gz',
      sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    });
  });

  it('scans complete history, an archived tracked tree, and generated output', () => {
    expect(publicationScanPlan('/repo', '/tracked-tree', '/working-tree')).toEqual([
      {
        args: [
          'git',
          '--log-opts=--all',
          '--config',
          '/repo/.gitleaks.toml',
          '--redact=100',
          '--ignore-gitleaks-allow',
          '--no-banner',
        ],
        label: 'complete Git history',
        target: '/repo',
      },
      {
        args: [
          'dir',
          '/tracked-tree',
          '--config',
          '/repo/.gitleaks.toml',
          '--redact=100',
          '--ignore-gitleaks-allow',
          '--no-banner',
        ],
        label: 'clean tracked tree',
        target: '/tracked-tree',
      },
      {
        args: [
          'dir',
          '/working-tree',
          '--config',
          '/repo/.gitleaks.toml',
          '--redact=100',
          '--ignore-gitleaks-allow',
          '--no-banner',
        ],
        label: 'current source tree',
        target: '/working-tree',
      },
      {
        args: [
          'dir',
          '/repo/dist',
          '--config',
          '/repo/.gitleaks.toml',
          '--redact=100',
          '--ignore-gitleaks-allow',
          '--no-banner',
        ],
        label: 'generated website',
        target: '/repo/dist',
      },
    ]);
  });

  it('fails closed when the scanner or its result is unavailable', () => {
    expect(() => assertScannerResult({ error: new Error('missing') }, 'history')).toThrow(
      /could not run/
    );
    expect(() => assertScannerResult({ status: null }, 'history')).toThrow(/did not report/);
    expect(() => assertScannerResult({ status: 1, stdout: '', stderr: '' }, 'history')).toThrow(
      /failed with status 1/
    );
  });

  it('replaces an existing scanner from the verified archive', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'og-gitleaks-extract-'));
    const scanner = path.join(directory, 'gitleaks');
    writeFileSync(scanner, 'tampered');
    const runCommand = (_command, _args) => {
      writeFileSync(scanner, 'verified');
      return { status: 0, stdout: '', stderr: '' };
    };

    extractVerifiedGitleaks({
      archivePath: path.join(directory, 'verified.tar.gz'),
      binaryPath: scanner,
      hostDir: directory,
      runCommand,
    });

    expect(readFileSync(scanner, 'utf8')).toBe('verified');
  });

  it('copies current tracked and new source without ignored local files', () => {
    const repository = mkdtempSync(path.join(tmpdir(), 'og-publication-source-'));
    const target = mkdtempSync(path.join(tmpdir(), 'og-publication-copy-'));
    const git = (...args) => execFileSync('git', args, { cwd: repository });
    git('init', '-q');
    git('config', 'user.email', 'test@example.test');
    git('config', 'user.name', 'Test');
    writeFileSync(path.join(repository, '.gitignore'), '.env\n');
    writeFileSync(path.join(repository, 'tracked.txt'), 'committed');
    git('add', '.gitignore', 'tracked.txt');
    git('commit', '-qm', 'add source');
    writeFileSync(path.join(repository, 'tracked.txt'), 'working tree');
    mkdirSync(path.join(repository, 'src'));
    writeFileSync(path.join(repository, 'src', 'new.mjs'), 'new source');
    writeFileSync(path.join(repository, '.env'), 'ignored local value');

    copyPublicationSourceTree(repository, target);

    expect(readFileSync(path.join(target, 'tracked.txt'), 'utf8')).toBe('working tree');
    expect(readFileSync(path.join(target, 'src', 'new.mjs'), 'utf8')).toBe('new source');
    expect(existsSync(path.join(target, '.env'))).toBe(false);
  });
});
