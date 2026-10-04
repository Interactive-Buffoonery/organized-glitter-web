// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  prepareSeededTest,
  nativeTestArguments,
  nativeTestEnvironment,
  selectSimulator,
  verifyNativeIntegration,
  nativeSnapshotCommit,
} from '../verify-native-integration.mjs';

describe('isolated native integration', () => {
  it('rejects a native checkout that advances after its snapshot is pinned', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'og-native-snapshot-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.test');
    git('commit', '--allow-empty', '-qm', 'add snapshot');
    const commit = nativeSnapshotCommit(root);
    expect(nativeSnapshotCommit(root, commit)).toBe(commit);
    git('commit', '--allow-empty', '-qm', 'advance native revision');
    expect(() => nativeSnapshotCommit(root, commit)).toThrow(
      'Native revision changed during integration.'
    );
  });
  it('returns advisory missing-output evidence without throwing', async () => {
    expect(await verifyNativeIntegration({ simulator: 'example' })).toMatchObject({
      outcome: 'not-run',
    });
  });
  it('selects only an available iOS 26 iPhone and rejects an unrelated device', () => {
    const devices = {
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
          {
            udid: 'phone',
            name: 'iPhone 17',
            isAvailable: true,
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
          },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
          {
            udid: 'old',
            name: 'iPhone',
            isAvailable: true,
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone',
          },
        ],
      },
    };
    expect(selectSimulator(devices, 'phone')).toBe('phone');
    expect(() => selectSimulator(devices, 'old')).toThrow();
    expect(() => selectSimulator(devices)).toThrow();
  });
  it('runs the seeded transport test only and passes test-runner variables', () => {
    expect(nativeTestArguments('/run', 'phone')).toContain(
      '-only-testing:OrganizedGlitterTests/PocketBaseClientTests/seededBackendRoundTripsDisposableRecordsAndMultipartFiles()'
    );
    expect(nativeTestArguments('/run', 'phone')).not.toContain('CODE_SIGNING_ALLOWED=NO');
    expect(
      nativeTestEnvironment(
        { PATH: '/bin', SERVICE_TOKEN: 'private', SEEDED_PB_URL: 'https://production.test' },
        'http://127.0.0.1:4567',
        'fixture-password'
      )
    ).toEqual({
      PATH: '/bin',
      TEST_RUNNER_RUN_SEEDED_POCKETBASE: '1',
      TEST_RUNNER_SEEDED_PB_URL: 'http://127.0.0.1:4567',
      TEST_RUNNER_SEEDED_PB_IDENTITY: 'native-sync@example.test',
      TEST_RUNNER_SEEDED_PB_PASSWORD: 'fixture-password',
    });
  });
  it('makes a missing seeded flag fail instead of silently passing', () => {
    const source = 'guard environment["RUN_SEEDED_POCKETBASE"] == "1" else { return }';
    const prepared = prepareSeededTest(source);
    expect(prepared).toContain('#expect(environment["RUN_SEEDED_POCKETBASE"] == "1")');
    expect(() => prepareSeededTest('unsupported guard')).toThrow();
  });

  it('keeps missing simulator evidence advisory without launching a backend', async () => {
    expect(await verifyNativeIntegration({ simulator: undefined })).toMatchObject({
      outcome: 'not-run',
    });
  });
});
